import { Client } from './Client'
import { ClientConnectionError } from './ClientConnection'
import { Context } from '../common/Context'
import { Binary } from '../common/binary/Binary'
import { defineMessageSchema } from '../common/binary/schema/defineSchema'
import { TestClientTransport, acceptance, heartbeat } from '../testSupport/ClientTransport'
import { createTestSnapshot } from './InterpolationTestHarness'
import { PredictionOperationStatus } from './prediction/PredictionLog'

function setup(options = {}) {
    const context = new Context()
    context.register(1, defineMessageSchema({ value: Binary.UInt8 }))
    const client = new Client(context, TestClientTransport, 20, undefined, {
        now: Date.now, connectTimeoutMs: 100, serverTimeoutMs: 200, ...options
    })
    const closed = jest.fn()
    client.setDisconnectHandler(closed)
    return { client, transport: client.adapter, closed }
}

beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
})
afterEach(() => jest.useRealTimers())

test.each(['connectTimeoutMs', 'serverTimeoutMs'])('%s validates policy and supports explicit opt out', name => {
    for (const value of [0, -1, NaN, Infinity, 2_147_483_648]) {
        expect(() => setup({ [name]: value })).toThrow(RangeError)
    }
    expect(() => setup({ [name]: null })).not.toThrow()
})

test('rejects an obsolete adapter clearly', () => {
    class OldAdapter { connect() {} }
    expect(() => new Client(new Context(), OldAdapter as any, 20)).toThrow('version 2 client transport adapter')
})

test.each(['JSON', 'truncated', 'duplicate', 'wire version'])('rejects invalid acceptance %s without exposing its data', async failure => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('first')
    const rejected = expect(connecting).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' })
    const handlers = transport.attempts[0]
    handlers.onOpen()
    let payload = acceptance(0)
    if (failure === 'JSON') payload[9] = 0x7b // Unclosed JSON object.
    if (failure === 'truncated') payload = payload.subarray(0, payload.length - 1)
    if (failure === 'duplicate') {
        payload = Buffer.from([...payload, ...payload.subarray(2)])
        payload[1] = 2
    }
    if (failure === 'wire version') payload[3] ^= 1
    handlers.onMessage(payload)
    await rejected
    expect(client.connectionState).toBe('idle')
    expect(closed).not.toHaveBeenCalled()

    const retry = client.connect<string>('second')
    transport.attempts[1].onOpen()
    handlers.onMessage(acceptance('stale'))
    transport.attempts[1].onMessage(acceptance('current'))
    await expect(retry).resolves.toBe('current')
    client.disconnect()
})

test.each([false, true])('one deadline covers transport opening and acceptance (opened=%s)', async opened => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('first')
    const rejected = expect(connecting).rejects.toMatchObject({ code: 'CONNECT_TIMEOUT' })
    jest.advanceTimersByTime(90)
    if (opened) transport.attempts[0].onOpen()
    jest.advanceTimersByTime(10)
    await rejected
    expect(client.connectionState).toBe('idle')
    expect(transport.close).toHaveBeenCalledWith('CONNECT_TIMEOUT', true)
    expect(closed).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)

    const retry = client.connect('second')
    transport.attempts[0].onOpen()
    transport.attempts[0].onMessage(acceptance())
    transport.attempts[0].onClose('late')
    transport.attempts[0].onError(new Error('late'))
    expect(client.connectionState).toBe('connecting')
    transport.accept()
    await expect(retry).resolves.toBeUndefined()
    client.disconnect()
})

test.each(['connecting', 'connected'])('an expired %s session cannot revive before its delayed timer runs', async phase => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('server')
    if (phase === 'connected') {
        transport.accept()
        await connecting
        jest.setSystemTime(201)
        transport.attempts[0].onMessage(heartbeat())
        expect(client.connectionState).toBe('closed')
        expect(closed).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVER_TIMEOUT' }))
        expect(client.network.getPendingFrameCount()).toBe(0)
    } else {
        const rejected = expect(connecting).rejects.toMatchObject({ code: 'CONNECT_TIMEOUT' })
        transport.attempts[0].onOpen()
        jest.setSystemTime(101)
        transport.attempts[0].onMessage(acceptance())
        await rejected
        expect(client.connectionState).toBe('idle')
    }
    expect(jest.getTimerCount()).toBe(0)
})

test('valid received traffic keeps the session alive without rendering or flushing, using one timer', async () => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('server')
    transport.accept()
    await connecting
    const schedule = jest.spyOn(globalThis, 'setTimeout')
    for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(10)
        transport.attempts[0].onMessage(heartbeat())
    }
    expect(schedule).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(100)
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(client.connectionState).toBe('connected')
    expect(client.network.getPendingFrameCount()).toBe(10)
    expect(client.network.commandFrameNumber).toBe(1)
    jest.advanceTimersByTime(100)
    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVER_TIMEOUT' }))
    expect(client.network.getPendingFrameCount()).toBe(0)
    schedule.mockRestore()
})

test('outbound work never renews the receive deadline', async () => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('server')
    transport.accept()
    await connecting
    for (let i = 0; i < 4; i++) {
        client.addCommand({ ntype: 1, value: i })
        client.flush()
        jest.advanceTimersByTime(50)
    }
    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ code: 'SERVER_TIMEOUT' }))
    expect(client.connectionState).toBe('closed')
})

test('disabled deadlines schedule no timer', async () => {
    const { client, transport } = setup({ connectTimeoutMs: null, serverTimeoutMs: null })
    const connecting = client.connect('server')
    jest.advanceTimersByTime(1_000_000)
    expect(client.connectionState).toBe('connecting')
    transport.accept()
    await connecting
    jest.advanceTimersByTime(1_000_000)
    expect(client.connectionState).toBe('connected')
    expect(jest.getTimerCount()).toBe(0)
    client.disconnect()
})

test('AbortSignal cancels only an unfinished attempt and removes its listener', async () => {
    const { client, transport, closed } = setup()
    const aborted = new AbortController()
    aborted.abort('already')
    await expect(client.connect('unused', {}, { signal: aborted.signal })).rejects.toMatchObject({ code: 'CANCELLED', detail: 'already' })
    expect(transport.attempts).toHaveLength(0)

    const signal = new AbortController()
    const remove = jest.spyOn(signal.signal, 'removeEventListener')
    const connecting = client.connect('server', {}, { signal: signal.signal })
    const rejected = expect(connecting).rejects.toMatchObject({ code: 'CANCELLED', detail: 'cancel' })
    signal.abort('cancel')
    await rejected
    expect(remove).toHaveBeenCalledTimes(1)
    expect(closed).not.toHaveBeenCalled()

    const retrySignal = new AbortController()
    const retryRemove = jest.spyOn(retrySignal.signal, 'removeEventListener')
    const retry = client.connect('server', {}, { signal: retrySignal.signal })
    transport.accept()
    retrySignal.abort()
    await retry
    expect(retryRemove).toHaveBeenCalledTimes(1)
    expect(client.connectionState).toBe('connected')
    client.disconnect()
})

test.each(['idle', 'connecting', 'closed'])('new application work fails in %s, and flush is a no-op', async phase => {
    const { client, transport } = setup()
    let connecting: Promise<unknown> | undefined
    if (phase !== 'idle') {
        connecting = client.connect('server')
        void connecting.catch(() => {})
        if (phase === 'closed') {
            transport.accept()
            await connecting
            client.disconnect()
        }
    }
    const command = { ntype: 1, value: 1 }
    const applyLocal = jest.fn()
    for (const action of [
        () => client.addCommand(command),
        () => client.addCommandWithTiming(command),
        () => client.predictCommand(command, { applyLocal }),
        () => client.predictCommandWithTiming(command, { applyLocal }),
        () => client.predictState(command, { applyLocal }),
        () => client.request(1, {}, { prediction: { applyLocal } })
    ]) expect(action).toThrow(ClientConnectionError)
    client.flush()
    expect(client.reportInterpolationDelay(100)).toBe(false)
    expect(client.network.outbound.outboundEngineCommands.size).toBe(0)
    expect(client.network.commandFrameNumber).toBe(1)
    expect(client.network.requests.size).toBe(0)
    expect(client.network.outbound.outboundCommands.size).toBe(0)
    expect(client.predictor.log.operations.size).toBe(0)
    expect(applyLocal).not.toHaveBeenCalled()
    client.disconnect()
    if (phase === 'connecting') await expect(connecting).rejects.toMatchObject({ code: 'CANCELLED' })
})

test('terminal cleanup settles every request, cancels prediction, preserves applied state, and tolerates observers', async () => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('server')
    transport.accept()
    await connecting
    client.network.queueSnapshot(createTestSnapshot({ serverTimeMs: 1 }))
    const applied = client.network.processNextFrame()
    client.network.queueSnapshot(createTestSnapshot({ serverTimeMs: 2 }))
    const reconcile = jest.fn(() => { throw new Error('must not reconcile cancellation') })
    const prediction = client.predictState({}, { reconcile })
    const requests = [1, 2, 3].map(id => client.request(id, {}, { prediction: { reconcile } }))
    const rejections = requests.map(request => expect(request).rejects.toMatchObject({ code: 'DISCONNECTED' }))
    client.addCommand({ ntype: 1, value: 7 })
    const detail: any = { long: 'é'.repeat(1000) }
    detail.circular = detail
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    transport.close.mockImplementation(() => { throw new Error('physical close failed') })
    closed.mockImplementation(() => {
        expect(client.connectionState).toBe('closed')
        expect(client.network.requests.size).toBe(0)
        expect(client.network.processNextFrame()).toBeNull()
        client.disconnect('again')
        throw new Error('observer failed')
    })
    expect(() => client.disconnect(detail)).not.toThrow()
    await Promise.all(rejections)
    expect(closed).toHaveBeenCalledTimes(1)
    expect(closed.mock.calls[0][0].detail).toBe(detail)
    expect(transport.close).toHaveBeenCalledWith('LOCAL_DISCONNECT', false)
    expect(prediction.status).toBe(PredictionOperationStatus.Cancelled)
    expect(reconcile).not.toHaveBeenCalled()
    expect(client.network.requestQueue.length).toBe(0)
    expect(client.predictor.log.operations.size).toBe(0)
    expect(client.network.outbound.outboundCommands.size).toBe(0)
    expect(client.network.latestFrame).toBe(applied)
    expect(client.network.frames).toEqual([applied])
    expect(jest.getTimerCount()).toBe(0)
    transport.attempts[0].onMessage(heartbeat())
    transport.attempts[0].onClose('late')
    transport.attempts[0].onError('late')
    expect(closed).toHaveBeenCalledTimes(1)
    log.mockRestore()
})

test('disconnect inside prediction validation cannot run later reconciliation callbacks', async () => {
    const { client, transport } = setup()
    const connecting = client.connect('server')
    transport.accept()
    await connecting
    const reconcile = jest.fn()
    const operation = client.predictState({}, { validate: () => {
            client.disconnect()
            return true
        }, reconcile })
    client.predictState({}, { reconcile })
    client.network.queueSnapshot(createTestSnapshot({ confirmedCommandFrameNumber: 1 }))
    client.network.processNextFrame()
    expect(operation.status).toBe(PredictionOperationStatus.Cancelled)
    expect(reconcile).not.toHaveBeenCalled()
    expect(client.connectionState).toBe('closed')
    expect(client.predictor.log.operations.size).toBe(0)
})

test.each(['malformed', 'send', 'remote', 'error'])('%s ends an accepted session once', async failure => {
    const { client, transport, closed } = setup()
    const connecting = client.connect('server')
    transport.accept()
    await connecting
    const request = client.request(1, {})
    const rejected = expect(request).rejects.toMatchObject({ code: 'DISCONNECTED' })
    const handlers = transport.attempts[0]
    if (failure === 'malformed') handlers.onMessage(Buffer.from([255]))
    if (failure === 'remote') handlers.onClose({ code: 1001, reason: 'away' })
    if (failure === 'error') handlers.onError(new Error('socket failed'))
    if (failure === 'send') {
        transport.send.mockImplementation(() => { throw new Error('send failed') })
        client.flush()
    }
    await rejected
    const code = failure === 'malformed' ? 'PROTOCOL_ERROR' : failure === 'remote' ? 'REMOTE_CLOSE' : 'TRANSPORT_ERROR'
    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ code }))
    expect(client.connectionState).toBe('closed')
    expect(client.network.requestQueue.length).toBe(0)
    handlers.onClose('later')
    expect(closed).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
})


test('a handshake serializer cannot close a replacement attempt with its old exception', async () => {
    const { client, transport } = setup()
    let retry!: Promise<unknown>
    const connecting = client.connect('first', {
        toJSON() {
            client.disconnect()
            retry = client.connect('second')
            throw new Error('obsolete serialization failure')
        }
    })
    const rejected = expect(connecting).rejects.toMatchObject({ code: 'CANCELLED' })
    transport.attempts[0].onOpen()
    await rejected
    expect(client.connectionState).toBe('connecting')
    transport.accept()
    await retry
    expect(client.connectionState).toBe('connected')
    client.disconnect()
})
