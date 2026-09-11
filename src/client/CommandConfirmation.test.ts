import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from './Client'
import { CommandReplayPrediction } from './prediction/CommandReplayPrediction'
import { Instance } from '../server/Instance'
import { CommandRouter } from '../server/CommandRouter'
import { Channel } from '../server/channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from '../server/adapter/MockAdapter'
import { testBinaryAdapter } from '../testSupport/BufferBinary'

async function setup() {
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float64 }))
    context.register(2, defineMessageSchema({ dx: Binary.Float64 }))
    const instance = new Instance(context)
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
    const socket = adapter.createMockConnect()
    const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
    client.setDisconnectHandler(() => undefined)
    await client.connect(socket.clientSocket)
    instance.queue.next()
    const user = Array.from(instance.users.values())[0]
    const channel = new Channel(instance.localState)
    const entity = channel.addEntity({ nid: 0, ntype: 1, x: 0 })
    channel.subscribe(user)
    const local = { x: 0 }
    const movement = new CommandReplayPrediction({
        client, nid: entity.nid, getLocal: () => local,
        createReplayState: authority => ({ x: authority.x }),
        applyCommand: (state, command: { ntype: number, dx: number }) => { state.x += command.dx },
        affectedProps: ['x']
    })
    const router = new CommandRouter()
    router.on(2, ({ command }) => { entity.x += command.dx })
    const drainCommands = () => {
        while (!instance.queue.isEmpty()) router.process(instance.queue.next())
    }
    return { instance, client, user, entity, local, movement, router, drainCommands }
}

describe('explicit command confirmation at the snapshot boundary', () => {
    it('observes each authoritative snapshot with its own boundary, including unchanged confirmation', async () => {
        const { instance, client, user, entity, local, movement, drainCommands } = await setup()
        movement.predict({ ntype: 2, dx: 2 })
        client.flush()
        drainCommands()
        user.confirmCommandsThrough(1)
        const observations: Array<[number, number, number]> = []
        for (const x of [2, 12, 22]) {
            entity.x = x
            instance.step()
        }
        movement.predict({ ntype: 2, dx: 3 })
        let frame
        while ((frame = client.network.processNextFrame())) {
            movement.reconcile()
            observations.push([frame.confirmedCommandFrameNumber, client.network.store.get(entity.nid)!.x, local.x])
        }
        expect(observations).toEqual([[1, 2, 5], [1, 12, 15], [1, 22, 25]])
        expect(client.predictor.log.getPendingCommands()).toHaveLength(1)
        client.disconnect()
    })

    it('does not confirm input that has not yet been flushed', async () => {
        const { instance, client, local, movement } = await setup()
        movement.predict({ ntype: 2, dx: 3 })
        instance.step()
        const frame = client.network.processNextFrame()!
        expect(frame.confirmedCommandFrameNumber).toBe(0)
        expect(movement.reconcile()).toMatchObject({ corrected: false, replayed: 1 })
        expect(local.x).toBe(3)
        expect(client.network.outbound.getUnconfirmedCommands().has(1)).toBe(true)
        client.disconnect()
    })

    it('confirms all drained batches against post-simulation state and retains newer prediction', async () => {
        const { instance, client, user, entity, local, movement, drainCommands } = await setup()
        movement.predict({ ntype: 2, dx: 2 })
        movement.predict({ ntype: 2, dx: 3 })
        client.flush()
        movement.predict({ ntype: 2, dx: 4 })
        client.flush()
        movement.predict({ ntype: 2, dx: 8 }) // Frame 3 has not been sent.
        drainCommands()
        entity.x -= 1 // Authoritative simulation after the input stage.
        user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
        instance.step()
        const frame = client.network.processNextFrame()!
        expect(frame.confirmedCommandFrameNumber).toBe(2)
        expect(client.network.store.entities.get(entity.nid)?.x).toBe(8)
        expect(movement.reconcile()).toMatchObject({ corrected: true, replayed: 1, state: { x: 16 } })
        expect(local.x).toBe(16)
        expect(Array.from(client.network.outbound.getUnconfirmedCommands().keys())).toEqual([3])
        client.disconnect()
    })

    it('confirms deliberately rejected input without claiming that movement succeeded', async () => {
        const { instance, client, user, local, movement } = await setup()
        const reject = jest.fn()
        const router = new CommandRouter().on(2, reject)
        movement.predict({ ntype: 2, dx: 5 })
        client.flush()
        while (!instance.queue.isEmpty()) router.process(instance.queue.next())
        expect(reject).toHaveBeenCalledTimes(1)
        user.confirmCommandsThrough(1)
        instance.step()
        const frame = client.network.processNextFrame()!
        expect(frame.confirmedCommandFrameNumber).toBe(1)
        expect(movement.reconcile()).toMatchObject({ corrected: true, replayed: 0, state: { x: 0 } })
        expect(local.x).toBe(0)
        client.disconnect()
    })

    it('can confirm an empty flush after earlier movement has been integrated', async () => {
        const { instance, client, user, local, movement, drainCommands } = await setup()
        movement.predict({ ntype: 2, dx: 5 })
        client.flush()
        client.flush()
        expect(instance.queue.length).toBe(1)
        drainCommands()
        user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
        instance.step()
        const frame = client.network.processNextFrame()!
        expect(frame.confirmedCommandFrameNumber).toBe(2)
        expect(movement.reconcile()).toMatchObject({ corrected: false, replayed: 0 })
        expect(local.x).toBe(5)
        client.disconnect()
    })

    it('keeps received and routed input pending until its deferred simulation is explicitly completed', async () => {
        const { instance, client, user, entity, local, movement } = await setup()
        const deferred: Array<{ command: { dx: number }, commandFrameNumber: number }> = []
        const router = new CommandRouter().on<{ dx: number }>(2, ({ command, commandFrameNumber }) => {
            deferred.push({ command, commandFrameNumber })
        })
        movement.predict({ ntype: 2, dx: 3 })
        client.flush()
        instance.step()
        expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(0)
        expect(movement.reconcile()).toMatchObject({ corrected: false, replayed: 1 })

        while (!instance.queue.isEmpty()) router.process(instance.queue.next())
        // A later input arrives while the first batch is waiting for simulation.
        movement.predict({ ntype: 2, dx: 7 })
        client.flush()
        while (!instance.queue.isEmpty()) router.process(instance.queue.next())
        expect(user.lastReceivedCommandFrameNumber).toBe(2)
        instance.step()
        expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(0)
        expect(movement.reconcile()).toMatchObject({ corrected: false, replayed: 2 })

        for (const completed of deferred) {
            entity.x += completed.command.dx
            user.confirmCommandsThrough(completed.commandFrameNumber)
            instance.step()
            expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(completed.commandFrameNumber)
            expect(client.network.store.get(entity.nid)?.x).toBe(entity.x)
            expect(movement.reconcile()).toMatchObject({ corrected: false, replayed: 2 - completed.commandFrameNumber })
            expect(local.x).toBe(10)
        }
        expect(client.network.outbound.getUnconfirmedCommands().size).toBe(0)
        client.disconnect()
    })

    it('releases ordinary command history in a game without prediction', async () => {
        const { instance, client, user, entity, drainCommands } = await setup()
        for (let frameNumber = 1; frameNumber <= 32; frameNumber++) {
            client.addCommand({ ntype: 2, dx: 1 })
            client.flush()
            expect(client.network.outbound.getUnconfirmedCommands().size).toBe(1)
            drainCommands()
            user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
            instance.step()
            expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(frameNumber)
            expect(client.network.store.get(entity.nid)?.x).toBe(frameNumber)
            expect(client.network.outbound.getUnconfirmedCommands().size).toBe(0)
            expect(client.predictor.log.operations.size).toBe(0)
        }
        client.disconnect()
    })

    it('delivers request responses and authoritative state without any command confirmation', async () => {
        const { instance, client, user, entity } = await setup()
        instance.respond(1, () => {
            entity.x = 42
            return { accepted: true }
        })
        const response = client.request(1, {}, { timeoutMs: 0 })
        client.flush()
        expect(instance.processRequests()).toBe(1)
        instance.step()
        expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(0)
        await expect(response).resolves.toEqual({ accepted: true })
        expect(client.network.store.get(entity.nid)?.x).toBe(42)
        expect(user.lastReceivedCommandFrameNumber).toBe(1)
        expect(user.lastConfirmedCommandFrameNumber).toBe(0)
        expect(client.network.outbound.getUnconfirmedCommands().size).toBe(0)
        client.disconnect()
    })

    it('rejects invalid or unreceived boundaries and never moves confirmation backwards', async () => {
        const { instance, client, user } = await setup()
        expect(user.confirmCommandsThrough(0)).toBe(0)
        client.flush()
        client.flush()
        for (const invalid of [-1, 0.5, NaN, Infinity, 3, 0x100000000]) {
            expect(() => user.confirmCommandsThrough(invalid)).toThrow(RangeError)
            expect(user.lastConfirmedCommandFrameNumber).toBe(0)
        }
        expect(user.confirmCommandsThrough(2)).toBe(2)
        expect(user.confirmCommandsThrough(2)).toBe(2)
        expect(user.confirmCommandsThrough(1)).toBe(2)
        instance.step()
        expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(2)
        client.disconnect()
    })
})
