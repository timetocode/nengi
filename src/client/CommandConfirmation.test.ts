import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client, ClientOptions } from './Client'
import { CommandReplayPrediction } from './prediction/CommandReplayPrediction'
import { Instance } from '../server/Instance'
import { CommandRouter } from '../server/CommandRouter'
import { Channel } from '../server/channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from '../server/adapter/MockAdapter'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { PredictionOperationStatus } from './prediction/PredictionLog'

async function setup(options: ClientOptions = {}) {
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float64 }))
    context.register(2, defineMessageSchema({ dx: Binary.Float64 }))
    const instance = new Instance(context, { now: options.now })
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary: testBinaryAdapter })
    const socket = adapter.createMockConnect()
    const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter }, options)
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
        expect(client.predictor.log.getPendingCommands().map(op => op.commandFrameNumber)).toEqual([1])
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
        expect(client.predictor.log.getPendingCommands().map(op => op.commandFrameNumber)).toEqual([3])
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
        expect(client.predictor.log.getPendingCommands()).toEqual([])
        client.disconnect()
    })

    it('runs ordinary commands for a long session without prediction or confirmation', async () => {
        const { instance, client, user, entity, drainCommands } = await setup()
        for (let frameNumber = 1; frameNumber <= 2048; frameNumber++) {
            client.addCommand({ ntype: 2, dx: 1 })
            client.flush()
            expect(client.network.outbound.getCurrentFrame().outboundCommands).toEqual([])
            drainCommands()
            instance.step()
            expect(client.network.processNextFrame()!.confirmedCommandFrameNumber).toBe(0)
            expect(client.network.store.get(entity.nid)?.x).toBe(frameNumber)
            expect(client.predictor.log.operations.size).toBe(0)
        }
        expect(entity.x).toBe(2048)
        expect(user.lastReceivedCommandFrameNumber).toBe(2048)
        expect(user.lastConfirmedCommandFrameNumber).toBe(0)
        expect(client.network.frames).toHaveLength(client.network.maxFrameHistory)
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
        expect(client.predictor.log.operations.size).toBe(0)
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

describe('prediction confirmation diagnostic', () => {
    let nowMs: number
    let warn: jest.SpyInstance
    let clients: Client[]

    beforeEach(() => {
        nowMs = 0
        clients = []
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        for (const client of clients) client.disconnect()
        jest.restoreAllMocks()
    })

    async function game(options: ClientOptions = {}) {
        const result = await setup({ now: () => nowMs, serverTimeoutMs: null, ...options })
        clients.push(result.client)
        return result
    }

    function step(game: Awaited<ReturnType<typeof setup>>, time: number) {
        nowMs = time
        game.instance.step()
        return game.client.network.processNextFrame()!
    }

    it.each(['command', 'state'])('warns once for a sent %s prediction without resolving or discarding it', async kind => {
        const g = await game()
        const command = { ntype: 2, dx: 1 }
        const operation = kind === 'command'
            ? g.client.predictCommandWithTiming(command)
            : g.client.predictState({ x: 1 })
        if (kind === 'state') g.client.addCommand(command)
        g.client.flush()
        step(g, 0)
        step(g, 1999)
        expect(warn).not.toHaveBeenCalled()
        step(g, 2000)
        step(g, 4000)
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('command frame 1 remains unconfirmed'))
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('user.confirmCommandsThrough(...)'))
        expect(operation.status).toBe(PredictionOperationStatus.Pending)
        expect(g.client.predictor.log.operations.get(operation.id)).toBe(operation)
        expect(g.client.connectionState).toBe('connected')
    })

    it('detects a stall after confirmation has previously advanced', async () => {
        const g = await game()
        g.movement.predict({ ntype: 2, dx: 1 })
        g.client.flush()
        g.drainCommands()
        g.user.confirmCommandsThrough(1)
        step(g, 0)
        nowMs = 50
        g.movement.predict({ ntype: 2, dx: 1 })
        g.client.flush()
        step(g, 50)
        step(g, 2049)
        expect(warn).not.toHaveBeenCalled()
        step(g, 2050)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('command frame 2 remains unconfirmed'))
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('last confirmed: 1'))
    })

    it('ignores unflushed predictions, including while automatic Pongs are sent', async () => {
        const g = await game()
        g.movement.predict({ ntype: 2, dx: 1 })
        step(g, 0)
        step(g, 3000)
        step(g, 6000)
        expect(warn).not.toHaveBeenCalled()
        expect(g.user.lastReceivedCommandFrameNumber).toBe(0)
        g.client.flush()
        step(g, 6000)
        step(g, 7999)
        expect(warn).not.toHaveBeenCalled()
        step(g, 8000)
        expect(warn).toHaveBeenCalledTimes(1)
    })

    it('ignores ordinary commands and request predictions, which resolve by response', async () => {
        const g = await game()
        g.instance.respond(1, () => ({ accepted: true }))
        const request = g.client.request(1, {}, { timeoutMs: 0, prediction: { applyLocal: () => {} } })
        request.catch(() => {})
        g.client.addCommand({ ntype: 2, dx: 1 })
        g.client.flush()
        step(g, 0)
        step(g, 5000)
        expect(g.client.predictor.log.getPendingRequests()).toHaveLength(1)
        expect(warn).not.toHaveBeenCalled()
        g.instance.processRequests()
        step(g, 5050)
        await expect(request).resolves.toEqual({ accepted: true })
        expect(g.client.predictor.log.operations.size).toBe(0)
        expect(g.user.lastConfirmedCommandFrameNumber).toBe(0)
    })

    it('allows deferred confirmation and starts a new observation window after completion or discard', async () => {
        const g = await game()
        g.movement.predict({ ntype: 2, dx: 1 })
        g.client.flush()
        step(g, 0)
        step(g, 1999)
        g.drainCommands()
        g.user.confirmCommandsThrough(1)
        step(g, 2000)
        step(g, 10000)
        expect(warn).not.toHaveBeenCalled()

        const discarded = g.client.predictCommand({ ntype: 2, dx: 1 })
        g.client.flush()
        step(g, 10000)
        g.client.predictor.log.discard(discarded)
        nowMs = 20000
        g.client.predictCommand({ ntype: 2, dx: 1 })
        g.client.flush()
        step(g, 20000)
        step(g, 21999)
        expect(warn).not.toHaveBeenCalled()
        step(g, 22000)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('command frame 3 remains unconfirmed'))
    })

    it('does not age a prediction using snapshots received before it was sent', async () => {
        const g = await game()
        g.instance.step()
        nowMs = 5000
        g.instance.step()
        g.movement.predict({ ntype: 2, dx: 1 })
        g.client.flush()
        g.client.network.drainFrames()
        expect(warn).not.toHaveBeenCalled()
        step(g, 6999)
        expect(warn).not.toHaveBeenCalled()
        step(g, 7000)
        expect(warn).toHaveBeenCalledTimes(1)
    })

    it('uses snapshot receipt time so delayed client application does not trigger a warning', async () => {
        const g = await game()
        g.movement.predict({ ntype: 2, dx: 1 })
        g.client.flush()
        g.instance.step()
        nowMs = 1000
        g.instance.step()
        g.drainCommands()
        g.user.confirmCommandsThrough(1)
        nowMs = 1050
        g.instance.step()
        nowMs = 10000
        g.client.network.drainFrames()
        expect(warn).not.toHaveBeenCalled()
        expect(g.client.predictor.log.getPendingCommands()).toEqual([])
    })

    it('does not treat an encoding failure as a send, and retries the same prediction batch', async () => {
        const g = await game()
        g.movement.predict({ ntype: 2, dx: 1 })
        jest.spyOn(g.client.adapter.binary, 'createWriter').mockImplementationOnce(() => { throw new Error('encode failed') })
        expect(() => g.client.flush()).toThrow('encode failed')
        step(g, 0)
        step(g, 5000)
        expect(warn).not.toHaveBeenCalled()
        expect(g.user.lastReceivedCommandFrameNumber).toBe(0)
        g.client.flush()
        expect(g.user.lastReceivedCommandFrameNumber).toBe(1)
        g.drainCommands()
        expect(g.entity.x).toBe(1)
        step(g, 5000)
        step(g, 6999)
        expect(warn).not.toHaveBeenCalled()
        g.user.confirmCommandsThrough(1)
        step(g, 7000)
        expect(warn).not.toHaveBeenCalled()
        expect(g.client.predictor.log.getPendingCommands()).toEqual([])
    })

    it.each([null, 5000])('supports a custom warning threshold of %s', async predictionWarningAfterMs => {
        const g = await game({ predictionWarningAfterMs })
        g.movement.predict({ ntype: 2, dx: 1 })
        g.client.flush()
        step(g, 0)
        step(g, 2000)
        step(g, 4999)
        expect(warn).not.toHaveBeenCalled()
        step(g, 5000)
        expect(warn).toHaveBeenCalledTimes(predictionWarningAfterMs === null ? 0 : 1)
    })

    it.each([0, -1, NaN, Infinity])('rejects an invalid warning threshold of %s', predictionWarningAfterMs => {
        expect(() => new Client(new Context(), LocalClientAdapter, 20, { binary: testBinaryAdapter }, {
            predictionWarningAfterMs
        })).toThrow('predictionWarningAfterMs')
    })
})
