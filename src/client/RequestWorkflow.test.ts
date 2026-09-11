import { Binary } from '../common/binary/Binary'
import { defineMessageSchema, defineEntitySchema } from '../common/binary/schema/defineSchema'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { Context } from '../common/Context'
import { Instance } from '../server/Instance'
import { Channel } from '../server/channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from '../server/adapter/MockAdapter'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { Client } from './Client'
import { UserConnectionState } from '../server/User'
import { CommandRouter } from '../server/CommandRouter'

async function connect() {
    const context = new Context()
    context.register(1, defineEntitySchema({ value: Binary.UInt8 }))
    context.register(2, defineMessageSchema({ value: Binary.UInt8 }))
    const instance = new Instance(context)
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
    const socket = adapter.createMockConnect()
    const client = new Client<LocalClientAdapter<Buffer, Buffer>>(
        context, LocalClientAdapter, 20, { binary: testBinaryAdapter }
    )
    client.setDisconnectHandler(() => undefined)
    await client.connect(socket.clientSocket)
    expect(instance.queue.next().type).toBe(NetworkEvent.UserConnected)
    const user = Array.from(instance.users.values())[0]
    return { instance, client, user }
}

describe('request workflows through encoded local transport', () => {
    it('lets an async operation finish after close while game code skips session-dependent effects', async () => {
        const { instance, client, user } = await connect()
        let finish!: (value: number) => void
        const operation = new Promise<number>(resolve => { finish = resolve })
        const applyToSession = jest.fn()
        let operationFinished = false
        let handlerFinished!: () => void
        const completion = new Promise<void>(resolve => { handlerFinished = resolve })
        instance.respond(1, async ({ user }) => {
            const result = await operation
            operationFinished = true
            if (user.connectionState === UserConnectionState.Open) applyToSession(result)
            handlerFinished()
            return { accepted: true }
        })
        const pending = client.request(1, {}, { timeoutMs: 0 })
        const rejected = expect(pending).rejects.toMatchObject({ code: 'DISCONNECTED' })
        client.flush()
        expect(instance.processRequests()).toBe(1)
        client.disconnect('abrupt close')
        await rejected
        finish(7)
        await completion
        // Let the endpoint promise's response-queue continuation run as well.
        await Promise.resolve()
        expect(operationFinished).toBe(true)
        expect(applyToSession).not.toHaveBeenCalled()
        expect(user.responseQueue).toEqual([])
        expect(instance.users.size).toBe(0)
    })

    it('stops a kicked user mid-batch and skips its later queued batches and requests', async () => {
        const { instance, client, user } = await connect()
        const requestHandler = jest.fn(() => ({ accepted: true }))
        instance.respond(1, requestHandler)
        const pending = client.request(1, {}, { timeoutMs: 0 })
        const rejected = expect(pending).rejects.toMatchObject({ code: 'DISCONNECTED' })
        client.addCommand({ ntype: 2, value: 1 })
        client.addCommand({ ntype: 2, value: 2 })
        client.flush()
        client.addCommand({ ntype: 2, value: 3 })
        client.flush()
        const ran: number[] = []
        const router = new CommandRouter().on(2, ({ user, command }) => {
            ran.push(command.value)
            user.disconnect('invalid input')
        })
        let count = 0
        while (!instance.queue.isEmpty()) count += router.process(instance.queue.next())
        expect(count).toBe(1)
        expect(ran).toEqual([1])
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.processRequests()).toBe(0)
        expect(requestHandler).not.toHaveBeenCalled()
        await rejected
    })

    it('lets game code await a completed final action before disconnecting', async () => {
        const { instance, client, user } = await connect()
        const channel = new Channel(instance.localState)
        const entity = channel.addEntity({ nid: 0, ntype: 1, value: 0 })
        channel.subscribe(user)
        instance.step()
        client.network.drainFrames()

        instance.respond(1, () => {
            entity.value = 7
            return { accepted: true }
        })
        let observedValue: number | undefined
        const leaving = (async () => {
            const response = client.request(1, {}, { timeoutMs: 0 })
            client.flush()
            const result = await response
            expect(result.accepted).toBe(true)
            observedValue = client.network.store.entities.get(entity.nid)?.value
            client.disconnect()
        })()

        expect(instance.processRequests()).toBe(1)
        instance.step()
        await Promise.resolve()
        expect(observedValue).toBeUndefined()
        expect(instance.users.size).toBe(1)

        // Receiving the bytes alone does not resolve the request: apply its frame.
        client.network.drainFrames()
        await leaving
        expect(observedValue).toBe(7)
        expect(instance.users.size).toBe(0)
        expect(user.subscriptions.size).toBe(0)
        expect(instance.queue.next().type).toBe(NetworkEvent.UserDisconnected)
        expect(instance.queue.isEmpty()).toBe(true)
    })

    it('preserves six request/response orders across flushes and server processing limits', async () => {
        const { instance, client } = await connect()
        const handled: number[] = []
        const replied: number[] = []
        const commandValues: number[] = []
        instance.respond(1, ({ body }) => {
            handled.push(body.value)
            return body
        })
        const responses: Promise<unknown>[] = []
        for (let value = 1; value <= 6; value++) {
            client.addCommand({ ntype: 2, value })
            responses.push(client.request(1, { value }, { timeoutMs: 0 }).then(response => {
                replied.push(response.value)
            }))
            if (value % 3 === 0) client.flush()
        }
        expect(handled).toEqual([])
        while (!instance.queue.isEmpty()) {
            const event = instance.queue.next()
            expect(event.type).toBe(NetworkEvent.CommandSet)
            for (const command of event.commands) commandValues.push(command.value)
        }
        expect(commandValues).toEqual([1, 2, 3, 4, 5, 6])
        for (let batch = 1; batch <= 3; batch++) {
            expect(instance.processRequests(2)).toBe(2)
            instance.step()
            client.network.drainFrames()
            await Promise.resolve()
            expect(handled).toEqual([1, 2, 3, 4, 5, 6].slice(0, batch * 2))
            expect(replied).toEqual(handled)
        }
        await Promise.all(responses)
        client.disconnect()
    })

    it('allows deferred responses to complete out of order without reordering handlers', async () => {
        const { instance, client } = await connect()
        const handled: number[] = []
        const replied: number[] = []
        let finishFirst!: (response: { value: number }) => void
        const firstResult = new Promise<{ value: number }>(resolve => { finishFirst = resolve })
        instance.respond(1, ({ body }) => {
            handled.push(body.value)
            return body.value === 1 ? firstResult : body
        })
        const first = client.request(1, { value: 1 }, { timeoutMs: 0 }).then(response => {
            replied.push(response.value)
        })
        const second = client.request(1, { value: 2 }, { timeoutMs: 0 }).then(response => {
            replied.push(response.value)
        })
        client.flush()
        instance.processRequests()
        expect(handled).toEqual([1, 2])
        instance.step()
        client.network.drainFrames()
        await second
        expect(replied).toEqual([2])

        finishFirst({ value: 1 })
        await firstResult
        instance.step()
        client.network.drainFrames()
        await first
        expect(replied).toEqual([2, 1])
        client.disconnect()
    })
})
