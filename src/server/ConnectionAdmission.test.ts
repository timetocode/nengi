import { Buffer } from 'buffer'
import { Client } from '../client/Client'
import { Context } from '../common/Context'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { WIRE_PROTOCOL_VERSION } from '../common/binary/Protocol'
import { testBinaryAdapter as binary } from '../testSupport/BufferBinary'
import { ConnectionAcceptance, ConnectionAttemptContext, Instance, InstanceOptions } from './Instance'
import { User, UserConnectionState } from './User'
import { LocalClientAdapter, LocalInstanceAdapter } from './adapter/MockAdapter'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(complete => {
        resolve = complete
    })
    return { promise, resolve }
}

function setup(options: InstanceOptions = {}) {
    let now = 0
    const instance = new Instance(new Context(), { ...options, now: () => now })
    const adapter = {
        serverAdapterVersion: 1 as const,
        binary,
        listen: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
        send: jest.fn(),
        disconnect: jest.fn(),
        terminate: jest.fn()
    }
    const open = () => {
        const user = new User(undefined, adapter)
        instance.network.onOpen(user)
        return user
    }
    return { instance, adapter, open, setTime: (time: number) => { now = time } }
}

test.each(['wire version', 'missing fingerprint', 'mismatched fingerprint'])(
    'keeps deliberate engine refusal diagnostics public: %s', async cause => {
        const { instance, adapter, open } = setup()
        instance.network.requireSchemaFingerprint = cause !== 'wire version'
        instance.onConnect = jest.fn(async () => true)
        const user = open()
        await instance.network.onHandshake(user, {}, cause === 'mismatched fingerprint' ? 'wrong' : '',
            cause === 'wire version' ? WIRE_PROTOCOL_VERSION + 1 : WIRE_PROTOCOL_VERSION)
        const client = new Client(instance.context, LocalClientAdapter, 20, { binary })
        const result = client.network.readHandshakeResponse(binary.createReader(adapter.send.mock.calls[0][1]))
        const reasons: Record<string, string> = {
            'wire version': 'wire_protocol_mismatch',
            'missing fingerprint': 'schema_fingerprint_required',
            'mismatched fingerprint': 'schema_fingerprint_mismatch'
        }
        expect(result).toMatchObject({ denied: true, reason: { reason: reasons[cause] } })
        expect(instance.onConnect).not.toHaveBeenCalled()
        expect(instance.queue.next().payload).toBeInstanceOf(Error)
        expect(instance.network.pendingUsers.size).toBe(0)
    }
)

test.each(['timeout', 'throw after timeout', 'close'])(
    'cancellation and deadlines take precedence while encoding a public denial: %s', async cause => {
        let now = 0
        const instance = new Instance(new Context(), { now: () => now })
        const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary })
        const client = new Client(instance.context, LocalClientAdapter, 20, { binary }, { now: () => now })
        let signal!: AbortSignal
        instance.onConnect = async (_handshake, attempt) => {
            signal = attempt.signal
            return {
                deny: {
                    toJSON() {
                        if (cause === 'close') attempt.user.disconnect('left')
                        else now = 5000
                        if (cause === 'throw after timeout') throw new Error('private serializer error')
                        return { reason: 'banned' }
                    }
                }
            }
        }
        try {
            await expect(client.connect(adapter.createMockConnect().clientSocket)).rejects.toMatchObject(cause === 'close'
                ? { code: 'REMOTE_CLOSE' }
                : { code: 'CONNECTION_DENIED', detail: { reason: 'handshake_timeout' } })
            expect(signal.aborted).toBe(true)
            expect(instance.network.pendingUsers.size).toBe(0)
            expect(instance.users.size).toBe(0)
            if (cause === 'close') expect(instance.queue.length).toBe(0)
            else expect(instance.queue.next().payload).toEqual({ reason: 'handshake_timeout' })
        } finally {
            await adapter.shutdown()
        }
    }
)

test('a failed public denial send preserves the local reason and releases admission', async () => {
    const { instance, adapter, open } = setup()
    const detail = { reason: 'full' }
    let signal!: AbortSignal
    instance.onConnect = async (_handshake, attempt) => {
        signal = attempt.signal
        return { deny: detail }
    }
    adapter.send.mockImplementation(() => { throw new Error('transport failed') })
    const user = open()
    await instance.network.onHandshake(user, {})
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(detail)
    expect(instance.queue.next().payload).toBe(detail)
    expect(instance.queue.length).toBe(0)
    expect(instance.network.pendingUsers.size).toBe(0)
    expect(user.connectionState).toBe(UserConnectionState.Closed)
})

test.each(['peer close', 'timeout', 'shutdown', 'protocol violation', 'network limit'])(
    'cancels pending application work exactly once after cleanup: %s', async cause => {
        const { instance, adapter, open, setTime } = setup({ limits: { maxPacketBytes: 16 } })
        const work = deferred<ConnectionAcceptance>()
        let context!: ConnectionAttemptContext
        const abandoned = jest.fn()
        let stateAtAbort: unknown
        instance.onConnect = (_handshake, attempt) => {
            context = attempt
            attempt.signal.addEventListener('abort', () => {
                abandoned(attempt.signal.reason)
                stateAtAbort = {
                    state: attempt.user.connectionState,
                    pending: instance.network.pendingUsers.has(attempt.user),
                    accepted: instance.users.size
                }
                // Application cleanup and adapters may close recursively.
                attempt.user.disconnect('recursive cleanup')
                instance.network.onClose(attempt.user)
            })
            return work.promise
        }
        const user = open()
        const task = instance.network.onHandshake(user, {})
        expect(context.user).toBe(user)
        expect(user.id).toBe(0)
        expect(user.instance).toBeNull()
        expect(context.signal.aborted).toBe(false)

        if (cause === 'peer close') instance.network.onClose(user, 'peer left')
        if (cause === 'timeout') {
            setTime(5000)
            instance.step()
        }
        if (cause === 'shutdown') instance.network.shutdownAdapter(adapter, 'maintenance')
        if (cause === 'protocol violation') instance.network.onMessage(user, Buffer.from([255]))
        if (cause === 'network limit') instance.network.onMessage(user, Buffer.alloc(17))

        expect(stateAtAbort).toEqual({ state: UserConnectionState.Closed, pending: false, accepted: 0 })
        expect(abandoned).toHaveBeenCalledTimes(1)
        if (cause === 'timeout') expect(context.signal.reason).toEqual({ reason: 'handshake_timeout' })
        if (cause === 'shutdown') expect(context.signal.reason).toBe('maintenance')
        if (cause === 'network limit') expect(context.signal.reason).toMatchObject({ reason: 'network_limit' })
        const toJSON = jest.fn()
        work.resolve({ serverData: 'abandoned', clientData: { toJSON } })
        await task
        expect(toJSON).not.toHaveBeenCalled()
        instance.network.onClose(user)
        expect(abandoned).toHaveBeenCalledTimes(1)
        expect(instance.users.size).toBe(0)
        expect(instance.queue.arr.map(event => event.type)).toEqual(
            cause === 'timeout' ? [NetworkEvent.UserConnectionDenied] : []
        )
    }
)

test.each(['denial', 'throw', 'invalid result', 'encoding', 'send', 'close during encoding', 'close during send'])(
    'releases setup resources on failure, even after the handler returned: %s', async cause => {
        const { instance, adapter, open } = setup()
        const release = jest.fn()
        let signal!: AbortSignal
        const failure = new Error('setup failed')
        instance.onConnect = async (_handshake, context) => {
            signal = context.signal
            signal.addEventListener('abort', release)
            if (cause === 'denial') return false
            if (cause === 'throw') throw failure
            if (cause === 'invalid result') return 'invalid' as any
            return {
                serverData: { release },
                clientData: {
                    toJSON() {
                        if (cause === 'encoding') throw failure
                        if (cause === 'close during encoding') context.user.disconnect('closed')
                        return { ready: true }
                    }
                }
            }
        }
        if (cause === 'send') adapter.send.mockImplementation(() => { throw failure })
        if (cause === 'close during send') adapter.send.mockImplementation(user => instance.network.onClose(user))
        const user = open()
        await instance.network.onHandshake(user, {})
        expect(release).toHaveBeenCalledTimes(1)
        expect(signal.aborted).toBe(true)
        if (cause === 'throw' || cause === 'encoding' || cause === 'send') expect(signal.reason).toBe(failure)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.network.pendingUsers.size).toBe(0)
        expect(instance.users.size).toBe(0)
        expect(instance.queue.arr.some(event => event.type === NetworkEvent.UserConnected)).toBe(false)
    }
)

test('successful acceptance hands resources to the queued lifecycle, even if disconnected before the game drains it', async () => {
    const { instance, open } = setup()
    let context!: ConnectionAttemptContext
    const release = jest.fn()
    const serverData = { release }
    instance.onConnect = async (_handshake, attempt) => {
        context = attempt
        context.signal.addEventListener('abort', release)
        return { serverData }
    }
    const user = open()
    await instance.network.onHandshake(user, {})
    user.disconnect('left immediately')
    expect(context.signal.aborted).toBe(false)
    expect(release).not.toHaveBeenCalled()
    const connected = instance.queue.next()
    expect(connected).toMatchObject({ type: NetworkEvent.UserConnected, user, payload: serverData })
    expect(connected.payload).toBe(serverData)
    expect(instance.queue.next()).toMatchObject({ type: NetworkEvent.UserDisconnected, user })
    expect(instance.queue.isEmpty()).toBe(true)
})

test('attempt-owned reservations allow retry while non-cancellable old work completes', async () => {
    const { instance, open } = setup()
    const oldWork = deferred<void>()
    const owners = new Map<string, User>()
    const releaseOldResource = jest.fn()
    instance.onConnect = async ({ account, delayed }, { user, signal }) => {
        if (owners.has(account)) return false
        owners.set(account, user)
        const release = () => {
            if (owners.get(account) === user) owners.delete(account)
        }
        signal.addEventListener('abort', release, { once: true })
        if (delayed) {
            await oldWork.promise
            if (signal.aborted) {
                releaseOldResource()
                release()
                return false
            }
        }
        return { serverData: { account, release } }
    }
    const abandoned = open()
    const first = instance.network.onHandshake(abandoned, { account: 'one', delayed: true })
    abandoned.disconnect('cancelled')
    const replacement = open()
    await instance.network.onHandshake(replacement, { account: 'one', delayed: false })
    oldWork.resolve()
    await first
    expect(releaseOldResource).toHaveBeenCalledTimes(1)
    expect(owners.get('one')).toBe(replacement)
    expect([...instance.users.values()]).toEqual([replacement])
    const connected = instance.queue.next()
    replacement.disconnect('finished')
    expect(instance.queue.next().type).toBe(NetworkEvent.UserDisconnected)
    connected.payload.release()
    expect(owners.size).toBe(0)
})

test.each([4999, 5000, 5001])('checks authentication completion against the deadline without a sweep: %i', async time => {
    const { instance, open, setTime } = setup()
    const work = deferred<boolean>()
    instance.onConnect = () => work.promise
    const user = open()
    const task = instance.network.onHandshake(user, {})
    setTime(4999)
    instance.step()
    setTime(time)
    work.resolve(true)
    await task
    expect(user.connectionState).toBe(time < 5000 ? UserConnectionState.Open : UserConnectionState.Closed)
    const event = instance.queue.next()
    expect(event.type).toBe(time < 5000 ? NetworkEvent.UserConnected : NetworkEvent.UserConnectionDenied)
    if (time >= 5000) expect(event.payload).toEqual({ reason: 'handshake_timeout' })
})

test('does not start application authentication for an expired handshake arrival', async () => {
    const { instance, open, setTime } = setup()
    instance.onConnect = jest.fn(async () => true)
    const user = open()
    setTime(5000)
    await instance.network.onHandshake(user, {})
    expect(instance.onConnect).not.toHaveBeenCalled()
    expect(instance.queue.next().payload).toEqual({ reason: 'handshake_timeout' })
    expect(instance.network.pendingUsers.size).toBe(0)
})

test.each(['encoding', 'rejection'])('a deadline includes time spent in setup %s', async cause => {
    const { instance, open, setTime } = setup()
    let signal!: AbortSignal
    instance.onConnect = async (_handshake, attempt) => {
        signal = attempt.signal
        if (cause === 'rejection') {
            setTime(5000)
            throw new Error('late failure')
        }
        return {
            clientData: {
                toJSON() {
                    setTime(5000)
                    return 'too late'
                }
            }
        }
    }
    await instance.network.onHandshake(open(), {})
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toEqual({ reason: 'handshake_timeout' })
    expect(instance.queue.next().payload).toEqual({ reason: 'handshake_timeout' })
    expect(instance.users.size).toBe(0)
})

test.each([false, true])('timeout denial is best effort and cannot delay cleanup (send fails=%s)', async sendFails => {
    let now = 0
    const instance = new Instance(new Context(), { now: () => now })
    const adapter = new LocalInstanceAdapter(instance.adapterHost, { binary })
    const client = new Client(instance.context, LocalClientAdapter, 20, { binary }, { now: () => now })
    const work = deferred<boolean>()
    let signal!: AbortSignal
    instance.onConnect = (_handshake, attempt) => {
        signal = attempt.signal
        return work.promise
    }
    const socket = adapter.createMockConnect()
    const task = client.connect(socket.clientSocket)
    const rejected = expect(task).rejects.toMatchObject(sendFails
        ? { code: 'REMOTE_CLOSE' }
        : { code: 'CONNECTION_DENIED', detail: { reason: 'handshake_timeout' } })
    if (sendFails) jest.spyOn(adapter, 'send').mockImplementation(() => { throw new Error('broken send') })
    now = 5000
    instance.step()
    await rejected
    expect(signal.reason).toEqual({ reason: 'handshake_timeout' })
    expect(instance.network.pendingUsers.size).toBe(0)
    expect(instance.users.size).toBe(0)
    work.resolve(true)
    await Promise.resolve()
    expect(instance.queue.next().payload).toEqual({ reason: 'handshake_timeout' })
    expect(instance.queue.isEmpty()).toBe(true)
})

test('admission expires only the old prefix and still enforces event capacity without server steps', () => {
    const { instance, open, setTime } = setup({ limits: { maxPendingConnections: 2, maxQueuedEvents: 4 } })
    const old = open()
    setTime(1000)
    const recent = open()
    setTime(5000)
    const replacement = open()
    expect(old.connectionState).toBe(UserConnectionState.Closed)
    expect([...instance.network.pendingUsers]).toEqual([recent])
    // One queued denial + two slots for recent + two for replacement exceeds 4.
    expect(replacement.connectionState).toBe(UserConnectionState.Closed)
    expect(instance.queue.next().payload).toEqual({ reason: 'handshake_timeout' })
    const admitted = open()
    expect([...instance.network.pendingUsers]).toEqual([recent, admitted])
    setTime(6000)
    instance.queue.clear()
    const refused = open()
    expect(recent.connectionState).toBe(UserConnectionState.Closed)
    expect(admitted.connectionState).toBe(UserConnectionState.OpenPreHandshake)
    expect(refused.connectionState).toBe(UserConnectionState.Closed)
})

test('a full idle instance admits a fresh socket after the handshake window without a step', () => {
    const { instance, open, setTime } = setup({ limits: { maxConnections: 2, maxPendingConnections: 2 } })
    const old = [open(), open()]
    setTime(5000)
    const replacement = open()
    expect(old.every(user => user.connectionState === UserConnectionState.Closed)).toBe(true)
    expect([...instance.network.pendingUsers]).toEqual([replacement])
    expect(instance.queue.arr.map(event => event.type)).toEqual([
        NetworkEvent.UserConnectionDenied, NetworkEvent.UserConnectionDenied
    ])
})

test('expiry callbacks can reconnect during admission without reopening a stopped adapter', async () => {
    const { instance, adapter, open, setTime } = setup()
    const work = deferred<boolean>()
    let duringAbort!: User
    instance.onConnect = (_handshake, { signal }) => {
        signal.addEventListener('abort', () => {
            duringAbort = open()
            instance.network.shutdownAdapter(adapter)
        })
        return work.promise
    }
    const task = instance.network.onHandshake(open(), {})
    setTime(5000)
    const outside = open()
    expect(duringAbort.connectionState).toBe(UserConnectionState.Closed)
    expect(outside.connectionState).toBe(UserConnectionState.Closed)
    expect(instance.network.pendingUsers.size).toBe(0)
    work.resolve(true)
    await task
    expect(instance.queue.arr.map(event => event.type)).toEqual([NetworkEvent.UserConnectionDenied])
})
