import { Binary } from '../common/binary/Binary'
import { defineMessageSchema, defineEntitySchema, definePayloadSchema } from '../common/binary/schema/defineSchema'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { Context } from '../common/Context'
import { Instance } from '../server/Instance'
import type { InstanceOptions } from '../server/Instance'
import { Channel } from '../server/channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from '../server/adapter/MockAdapter'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { Client, ClientOptions } from './Client'
import { RequestPolicy, defineEndpoint } from '../common/Endpoint'
import { UserConnectionState } from '../server/User'
import { CommandRouter } from '../server/CommandRouter'

async function connect(options: InstanceOptions = {}, clientOptions: ClientOptions = {}) {
    const context = new Context()
    context.register(1, defineEntitySchema({ value: Binary.UInt8 }))
    context.register(2, defineMessageSchema({ value: Binary.UInt8 }))
    const instance = new Instance(context, options)
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary: testBinaryAdapter })
    const socket = adapter.createMockConnect()
    const client = new Client<LocalClientAdapter<Buffer, Buffer>>(
        context, LocalClientAdapter, 20, { binary: testBinaryAdapter }, clientOptions
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

    it.each([true, false])('applies a final action before resolving its response (entityHistory=%s)', async entityHistory => {
        const { instance, client, user } = await connect({}, { entityHistory })
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


test.each(['before application', 'inside prediction'])('disconnect %s discards received responses without stranding promises', async when => {
    const { instance, client } = await connect()
    instance.respond(1, () => ({ value: 7 }))
    const reconcile = jest.fn(({ accepted }) => { if (accepted) client.disconnect() })
    const first = client.request(1, {}, { timeoutMs: 0, prediction: { reconcile } })
    const second = client.request(1, {}, { timeoutMs: 0 })
    const firstOutcome = first.then(() => 'resolved', error => error.code)
    const secondOutcome = second.then(() => 'resolved', error => error.code)
    client.flush()
    instance.processRequests()
    instance.step()
    expect(client.network.getPendingFrameCount()).toBe(1)
    if (when === 'before application') client.disconnect()
    client.network.drainFrames()
    expect(await firstOutcome).toBe(when === 'before application' ? 'DISCONNECTED' : 'resolved')
    expect(await secondOutcome).toBe('DISCONNECTED')
    expect(reconcile).toHaveBeenCalledTimes(when === 'before application' ? 0 : 1)
    expect(client.network.requests.size).toBe(0)
    expect(client.network.getPendingFrameCount()).toBe(0)
})

test('a replacement prediction that disconnects cannot enqueue another request after teardown', async () => {
    const { client } = await connect()
    const first = client.request(1, {}, {
        key: 'one', prediction: { reconcile: () => client.disconnect() }
    })
    const rejected = expect(first).rejects.toMatchObject({ code: 'REPLACED' })
    expect(() => client.request(1, {}, { key: 'one', policy: RequestPolicy.ReplaceQueued })).toThrow('session has ended')
    await rejected
    expect(client.connectionState).toBe('closed')
    expect(client.network.requests.size).toBe(0)
    expect(client.network.requestQueue.length).toBe(0)
})

test('ReplaceQueued preserves sent outcomes and replaces only the remaining intent', async () => {
    const { instance, client } = await connect()
    const actions: number[] = []
    instance.respond(1, ({ body }) => {
        actions.push(body.value)
        return body.value
    })
    const options = { key: 'switch:1', policy: RequestPolicy.ReplaceQueued, timeoutMs: 0 }
    const first = client.request(1, { value: 1 }, options)
    client.flush()
    const second = client.request(1, { value: 2 }, options).catch(error => error.code)
    const third = client.request(1, { value: 3 }, options)
    client.flush()
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    expect(await Promise.all([first, second, third])).toEqual([1, 'REPLACED', 3])
    expect(actions).toEqual([1, 3])
    client.disconnect()
})

test('an invalid new JSON payload does not discard the queued request it would replace', async () => {
    const { instance, client } = await connect()
    instance.respond(1, ({ body }) => body)
    const options = { key: 'selection', policy: RequestPolicy.ReplaceQueued, timeoutMs: 0 }
    const first = client.request(1, { value: 1 }, options)
    const circular: any = {}
    circular.self = circular
    expect(() => client.request(1, circular, options)).toThrow()
    client.flush()
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    await expect(first).resolves.toEqual({ value: 1 })
    client.disconnect()
})

test('ReplaceQueued respects the 255 request batch and finds queued matches behind sent ones', async () => {
    const { instance, client } = await connect({ limits: { maxQueuedRequestsPerUser: 512 } })
    instance.network.onResponseBacklog = jest.fn()
    instance.respond(1, ({ body }) => body.value)
    const promises: Promise<any>[] = []
    for (let value = 0; value < 256; value++) {
        promises.push(client.request(1, { value }, {
            key: value === 0 || value === 255 ? 'selection' : undefined,
            timeoutMs: 0
        }).catch(error => error.code))
    }
    client.network.onRequestBacklog = () => {
        promises.push(client.request(1, { value: 256 }, {
            key: 'selection', policy: RequestPolicy.ReplaceQueued, timeoutMs: 0
        }))
    }
    client.flush()
    client.flush()
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    instance.step()
    client.network.drainFrames()
    expect(await Promise.all(promises)).toEqual([
        ...Array.from({ length: 255 }, (_, i) => i), 'REPLACED', 256
    ])
    client.disconnect()
})

test.each([false, true])('encoding reserves selected requests, with failed encoding rollback=%s', async fail => {
    const { instance, client } = await connect()
    client.network.onRequestBacklog = jest.fn()
    const actions: number[] = []
    instance.respond(1, ({ body }) => {
        actions.push(body.value)
        return body.value
    })
    const options = { key: 'selection', policy: RequestPolicy.ReplaceQueued, timeoutMs: 0 }
    const outcomes = [client.request(1, { value: 1 }, options).catch(error => error.code)]
    const createWriter = testBinaryAdapter.createWriter.bind(testBinaryAdapter)
    const writer = jest.spyOn(testBinaryAdapter, 'createWriter').mockImplementationOnce(bytes => {
        outcomes.push(client.request(1, { value: 2 }, options).catch(error => error.code))
        expect(client.network.requests.size).toBe(2)
        if (fail) throw new Error('encoding failed')
        return createWriter(bytes)
    })
    try {
        if (fail) expect(() => client.flush()).toThrow('encoding failed')
        else client.flush()
    } finally {
        writer.mockRestore()
    }
    if (fail) {
        expect(client.network.requestQueue.length).toBe(2)
        outcomes.push(client.request(1, { value: 3 }, options))
    }
    client.flush()
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    expect(await Promise.all(outcomes)).toEqual(fail ? ['REPLACED', 'REPLACED', 3] : [1, 2])
    expect(actions).toEqual(fail ? [3] : [1, 2])
    client.disconnect()
})

test('Dedupe still shares a sent request promise', async () => {
    const { instance, client } = await connect()
    instance.respond(1, ({ body }) => body)
    const options = { key: 'chest', policy: RequestPolicy.Dedupe, timeoutMs: 0 }
    const first = client.request(1, { value: 1 }, options)
    client.flush()
    expect(client.request(1, { value: 2 }, options)).toBe(first)
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    await expect(first).resolves.toEqual({ value: 1 })
    client.disconnect()
})

test('removed success callback forms fail clearly without creating a pending promise', async () => {
    const { client } = await connect()
    // @ts-expect-error Client callbacks were removed in favor of Promise observers.
    expect(() => client.request(1, {}, () => {})).toThrow('returns a Promise')
    // @ts-expect-error The old options callback is also unsupported.
    expect(() => client.request(1, {}, { callback: () => {} })).toThrow('returns a Promise')
    expect(client.network.requests.size).toBe(0)
    client.disconnect()
})

test('a throwing Promise observer cannot strand another response in the same snapshot', async () => {
    const { instance, client } = await connect()
    instance.respond(1, ({ body }) => body.value)
    const error = new Error('observer failed')
    const first = client.request(1, { value: 1 }).then(() => { throw error })
    const rejected = expect(first).rejects.toBe(error)
    const second = client.request(1, { value: 2 })
    client.flush()
    instance.processRequests()
    instance.step()
    expect(() => client.network.drainFrames()).not.toThrow()
    await rejected
    await expect(second).resolves.toBe(2)
    expect(client.network.requests.size).toBe(0)
    client.disconnect()
})

test.each(['JSON', 'async JSON', 'schema'])('bad %s replies report encoding failures without hiding them as timeouts', async kind => {
    const { instance, client, user } = await connect()
    const endpoint = defineEndpoint(1, kind === 'schema' ? { responseSchema: definePayloadSchema({ name: Binary.String }) } : {})
    const circular: any = {}
    circular.self = circular
    let effects = 0
    instance.respond(endpoint, () => {
        effects++
        return kind === 'schema' ? {} : kind === 'async JSON' ? Promise.resolve(circular) : circular
    })
    instance.respond(2, () => ({ ok: true }))
    const diagnostic = jest.fn(() => { throw new Error('broken diagnostic observer') })
    instance.onRequestError = diagnostic
    const failed = client.request(endpoint, {}, { timeoutMs: 0 })
    const rejected = expect(failed).rejects.toMatchObject({ code: 'RESPONSE_ENCODING_ERROR', endpointId: 1 })
    const healthy = client.request(2, {}, { timeoutMs: 0 })
    client.flush()
    instance.processRequests()
    await Promise.resolve()
    instance.step()
    client.network.drainFrames()
    await rejected
    await expect(healthy).resolves.toEqual({ ok: true })
    expect(effects).toBe(1) // Failure to deliver a reply does not undo the action.
    expect(diagnostic).toHaveBeenCalledTimes(1)
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ user, requestId: 1, endpointId: 1, phase: 'response', error: expect.any(Error) }))
    expect(client.connectionState).toBe('connected')
    expect(instance.failure).toBeNull()
    expect(instance.network.queuedResponseBytes).toBe(0)
    client.disconnect()
})

test.each(['maxQueuedResponseBytesPerUser', 'maxQueuedResponseBytes'] as const)('an individually oversized reply uses a bounded error within %s', async limit => {
    const { instance, client, user } = await connect({ limits: { [limit]: 256 } })
    instance.respond(1, () => 'x'.repeat(1024))
    const diagnostic = jest.fn()
    instance.onRequestError = diagnostic
    const failed = client.request(1, {}, { timeoutMs: 0 })
    const rejected = expect(failed).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
    client.flush()
    instance.processRequests()
    expect(user.queuedResponseBytes).toBeGreaterThan(0)
    expect(user.queuedResponseBytes).toBeLessThanOrEqual(256)
    instance.step()
    client.network.drainFrames()
    await rejected
    expect(diagnostic.mock.calls[0][0]).toMatchObject({ code: 'RESPONSE_TOO_LARGE', error: { byteLength: 1039, maximum: 256 } })
    expect(client.connectionState).toBe('connected')
    expect(instance.network.queuedResponseCount).toBe(0)
    client.disconnect()
})

test('individually valid responses still close a user when their accumulated bytes exceed the budget', async () => {
    const { instance, client } = await connect({ limits: { maxQueuedResponseBytesPerUser: 256 } })
    instance.respond(1, () => 'x'.repeat(150))
    const errors = jest.fn()
    instance.onNetworkLimit = errors
    const first = client.request(1, {}).catch(error => error.code)
    const second = client.request(1, {}).catch(error => error.code)
    client.flush()
    instance.processRequests()
    expect(await Promise.all([first, second])).toEqual(['DISCONNECTED', 'DISCONNECTED'])
    expect(errors.mock.calls[0][0].limit).toBe('maxQueuedResponseBytesPerUser')
    expect(instance.network.queuedResponseBytes).toBe(0)
    expect(instance.network.queuedResponseCount).toBe(0)
})

test.each([false, true])('response encoding keeps its one-reply reservation when reentered, invalid=%s', async invalid => {
    const { instance, client, user } = await connect()
    instance.respond(1, (_request, send) => {
        const value: any = {
            toJSON() {
                send({ duplicate: true })
                if (invalid) throw new Error('private encoding detail')
                return { ok: true }
            }
        }
        send(value)
        send({ duplicate: true })
        return { duplicate: true }
    })
    const outcome = client.request(1, {}).catch(error => ({ code: error.code, message: error.message }))
    client.flush()
    instance.processRequests()
    expect(user.responseQueue).toHaveLength(1)
    instance.step()
    client.network.drainFrames()
    expect(await outcome).toEqual(invalid ? { code: 'RESPONSE_ENCODING_ERROR', message: 'Response could not be encoded.' } : { ok: true })
    client.disconnect()
})

test.each([false, true])('handler failures reserve their error reply, async=%s', async asyncHandler => {
    const { instance, client, user } = await connect()
    const failure = new Error('private handler detail')
    let lateSend!: (value: any) => void
    const diagnostic = jest.fn()
    instance.onRequestError = diagnostic
    instance.respond(1, (_request, send) => {
        lateSend = send
        if (asyncHandler) return Promise.reject(failure)
        throw failure
    })
    const outcome = client.request(1, {}).catch(error => ({ code: error.code, message: error.message }))
    client.flush()
    instance.processRequests()
    await Promise.resolve()
    await Promise.resolve()
    lateSend({ duplicate: true })
    expect(user.responseQueue).toHaveLength(1)
    instance.step()
    client.network.drainFrames()
    expect(await outcome).toEqual({ code: asyncHandler ? 'HANDLER_REJECTED' : 'HANDLER_ERROR', message: 'Request handler failed.' })
    expect(diagnostic.mock.calls[0][0]).toMatchObject({ error: failure, phase: 'handler', endpointId: 1 })
    client.disconnect()
})

test('a handler can still defer its one reply by retaining send', async () => {
    const { instance, client, user } = await connect()
    let sendLater!: (value: any) => void
    instance.respond(1, (_request, send) => { sendLater = send })
    const outcome = client.request(1, {}, { timeoutMs: 0 })
    client.flush()
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    expect(client.network.requests.size).toBe(1)
    sendLater({ ok: true })
    sendLater({ duplicate: true })
    expect(user.responseQueue).toHaveLength(1)
    instance.step()
    client.network.drainFrames()
    await expect(outcome).resolves.toEqual({ ok: true })
    client.disconnect()
})

test.each([false, true])('a late handler failure remains diagnostic after an earlier reply, closed=%s', async close => {
    const { instance, client, user } = await connect()
    const failure = new Error('failed after replying')
    let reject!: (error: Error) => void
    const pending = new Promise((resolve, rejectPromise) => { reject = rejectPromise })
    const diagnostic = jest.fn()
    instance.onRequestError = diagnostic
    instance.respond(1, (_request, send) => {
        send({ ok: true })
        return pending
    })
    const outcome = client.request(1, {})
    client.flush()
    instance.processRequests()
    instance.step()
    client.network.drainFrames()
    await expect(outcome).resolves.toEqual({ ok: true })
    if (close) client.disconnect()
    reject(failure)
    await Promise.resolve()
    await Promise.resolve()
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ error: failure, phase: 'handler', code: 'HANDLER_REJECTED' }))
    expect(user.responseQueue).toHaveLength(0)
    expect(instance.network.queuedResponseCount).toBe(0)
    if (!close) client.disconnect()
})

test('schema replies count the owned value once and cannot retain charges after a getter disconnects', async () => {
    const { instance, client, user } = await connect()
    const endpoint = defineEndpoint(1, { responseSchema: definePayloadSchema({ name: Binary.String }) })
    let reads = 0
    instance.respond(endpoint, () => ({
        get name() {
            reads++
            return reads === 1 ? 'small' : 'a larger value'
        }
    }))
    const outcome = client.request(endpoint, {})
    client.flush()
    instance.processRequests()
    expect(reads).toBe(1)
    instance.step()
    client.network.drainFrames()
    await expect(outcome).resolves.toEqual({ name: 'small' })

    instance.respond(2, () => ({
        toJSON() {
            user.disconnect('closed during response encoding')
            return { ok: true }
        }
    }))
    const disconnected = client.request(2, {}).catch(error => error.code)
    client.flush()
    instance.processRequests()
    expect(await disconnected).toBe('DISCONNECTED')
    expect(instance.network.queuedResponseCount).toBe(0)
    expect(instance.network.queuedResponseBytes).toBe(0)
})
