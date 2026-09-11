import { Buffer } from 'buffer'
import { readFileSync } from 'fs'
import { join as joinPath } from 'path'
import {
    Binary, BinarySection, Client, CommandRouter, Context, DEFAULT_NETWORK_LIMITS,
    EngineMessage, Instance, LocalClientAdapter, LocalInstanceAdapter, NetworkEvent,
    User, UserConnectionState, defineEndpoint, defineMessageSchema, definePayloadSchema
} from '../index'
import type { NetworkLimits } from './NetworkLimits'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { countEndpointPayload, createEndpointPayload } from '../binary/endpoint/EndpointPayload'
import createSnapshotBuffer from '../binary/snapshot/createSnapshotBuffer'

function fixture(limits: Partial<NetworkLimits> = {}) {
    let now = 0
    const context = new Context()
    context.register(1, defineMessageSchema({ value: Binary.UInt8 }))
    const instance = new Instance(context, { limits, now: () => now })
    instance.onConnect = async () => true
    instance.network.onResponseBacklog = () => {}
    const errors = jest.fn()
    instance.onNetworkLimit = errors
    const adapter = { binary: testBinaryAdapter, send: jest.fn(), disconnect: jest.fn(), terminate: jest.fn(), listen: jest.fn() }
    const pending = () => {
        const user = new User(undefined, adapter)
        instance.network.onOpen(user)
        return user
    }
    const accepted = () => {
        const user = pending()
        expect(user.connectionState).toBe(UserConnectionState.OpenPreHandshake)
        user.instance = instance
        instance.network.onConnectionAccepted(user, {})
        return user
    }
    return { instance, errors, adapter, pending, accepted, setTime: (value: number) => { now = value } }
}
function commands(...values: number[]) {
    return Buffer.from([BinarySection.Commands, values.length, ...values.flatMap(value => [1, value])])
}
function request(id = 1, endpoint = 1) {
    const packet = Buffer.alloc(20)
    packet[0] = BinarySection.Requests
    packet[1] = 1
    packet.writeUInt32BE(id, 2)
    packet.writeUInt32BE(endpoint, 6)
    packet.writeUInt32BE(6, 10)
    packet.writeUInt32BE(2, 14)
    packet.write('{}', 18)
    return packet
}
function join(...parts: Buffer[]) { return Buffer.from(parts.flatMap(part => [...part])) }
function slots(instance: Instance) {
    return instance.queue.length + instance.users.size + 2 * instance.network.pendingUsers.size
}

describe('network admission and queue limits', () => {
    it('keeps the shipped developer table in agreement with every default', () => {
        const manual = readFileSync(joinPath(__dirname, '../../docs/ai/network-limits.md'), 'utf8')
        const documented = Object.fromEntries(Array.from(manual.matchAll(/\| `(\w+)` \| ([\d,]+) \|/g),
            match => [match[1], Number(match[2].replace(/,/g, ''))]))
        expect(documented).toEqual(DEFAULT_NETWORK_LIMITS)
    })
    it('merges overrides, freezes budgets, and keeps the published defaults unchanged', () => {
        const { instance } = fixture({ maxConnections: 8 })
        expect(instance.limits.maxConnections).toBe(8)
        expect(instance.limits.maxPacketBytes).toBe(65536)
        expect(DEFAULT_NETWORK_LIMITS.maxConnections).toBe(4096)
        expect(Object.isFrozen(instance.limits)).toBe(true)
    })

    it.each([0, -1, Infinity, NaN, 1.5])('rejects invalid limits: %s', value => {
        expect(() => fixture({ packetBurst: value })).toThrow(/positive safe integer/)
    })

    it('rejects misspelled keys and a burst smaller than one allowed packet', () => {
        expect(() => fixture({ packetBrust: 2 } as any)).toThrow(/Unknown/)
        expect(() => fixture({ constructor: 2 } as any)).toThrow(/Unknown/)
        expect(() => fixture({ maxPacketBytes: 32, byteBurst: 16 })).toThrow(/byteBurst/)
    })

    it('bounds pending admissions before authentication without queuing refusal events', async () => {
        const { instance, pending, errors } = fixture({ maxPendingConnections: 1 })
        const first = pending()
        const refused = pending()
        const auth = jest.fn(async () => true)
        instance.onConnect = auth
        await instance.network.onHandshake(refused, {})
        expect(auth).not.toHaveBeenCalled()
        expect(refused.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.queue.length).toBe(0)
        expect(errors).toHaveBeenCalledWith(expect.objectContaining({ limit: 'maxPendingConnections' }))
        first.disconnect('test cleanup')
        expect(pending().connectionState).toBe(UserConnectionState.OpenPreHandshake)
    })

    it('counts pending and accepted users together, preserving an established user on refusal', () => {
        const { instance, pending, accepted, errors } = fixture({ maxConnections: 2 })
        const healthy = accepted()
        pending()
        pending()
        expect(instance.users.has(healthy.id)).toBe(true)
        expect(instance.network.pendingUsers.size).toBe(1)
        expect(errors.mock.calls[0][0].limit).toBe('maxConnections')
    })

    it('does not scan another user\'s request backlog when refusing admission', () => {
        const { instance, accepted, pending } = fixture({ maxConnections: 1 })
        const healthy = accepted()
        instance.network.onMessage(healthy, request())
        const purge = jest.spyOn(instance.network, 'purgeRequestsForUser')
        pending()
        expect(purge).not.toHaveBeenCalled()
        expect(instance.network.requestQueue.length).toBe(1)
    })

    it.each([true, false])('bounds serial reconnect events and reserves cleanup: accepted=%s', async accept => {
        const { instance, pending } = fixture({ maxQueuedEvents: 4 })
        instance.onConnect = async () => accept
        for (let i = 0; i < 20; i++) {
            const user = pending()
            if (user.connectionState !== UserConnectionState.Closed) {
                await instance.network.onHandshake(user, {})
                if (accept) user.disconnect('test cleanup')
            }
            expect(slots(instance)).toBeLessThanOrEqual(4)
        }
        expect(instance.queue.length).toBe(accept ? 4 : 3)
        expect(instance.users.size).toBe(0)
        instance.queue.clear()
        expect(pending().connectionState).toBe(UserConnectionState.OpenPreHandshake)
    })

    it('protects disconnect slots when commands fill the rest of the event queue', () => {
        const { instance, accepted, errors } = fixture({ maxQueuedEvents: 4 })
        const user = accepted() // one connected event and one reserved disconnect
        instance.network.onMessage(user, commands(1))
        instance.network.onMessage(user, commands(2))
        instance.network.onMessage(user, commands(3))
        expect(errors.mock.calls[0][0].limit).toBe('maxQueuedEvents')
        expect(instance.queue.length).toBe(4)
        expect(instance.queue.arr.filter(event => event.type === NetworkEvent.UserDisconnected)).toHaveLength(1)
        expect(user.queuedCommandCount).toBe(2)
        instance.queue.clear()
        expect(user.queuedCommandCount).toBe(0)
    })

    it('releases timed-out handshake reservations but does not accept late auth completion', async () => {
        const { instance, pending, setTime } = fixture({ maxQueuedEvents: 4, maxPendingConnections: 1 })
        let finish!: (value: any) => void
        instance.onConnect = () => new Promise(resolve => { finish = resolve })
        const user = pending()
        const task = instance.network.onHandshake(user, {})
        setTime(5001)
        instance.step()
        expect(instance.network.pendingUsers.size).toBe(0)
        expect(pending().connectionState).toBe(UserConnectionState.OpenPreHandshake)
        finish(true)
        await task
        expect(instance.users.size).toBe(0)
        expect(slots(instance)).toBeLessThanOrEqual(4)
    })

    it('rejects an oversized packet before constructing a reader; diagnostic failures are contained', () => {
        const { instance, accepted, adapter } = fixture({ maxPacketBytes: 3 })
        const user = accepted()
        const reader = jest.spyOn(adapter.binary, 'createReader')
        const diagnostic = jest.fn(() => {
            instance.network.onMessage(user, Buffer.alloc(4))
            throw new Error('observer')
        })
        instance.onNetworkLimit = diagnostic
        try {
            instance.network.onMessage(user, Buffer.alloc(4))
            expect(reader).not.toHaveBeenCalled()
            expect(diagnostic).toHaveBeenCalledTimes(1)
            expect(user.connectionState).toBe(UserConnectionState.Closed)
        } finally { reader.mockRestore() }
    })

    it('allows packet bursts and refills by elapsed time, not step calls', () => {
        const { instance, accepted, setTime } = fixture({ packetBurst: 2, packetsPerSecond: 2 })
        const user = accepted()
        const empty = Buffer.alloc(0)
        instance.network.onMessage(user, empty)
        instance.network.onMessage(user, empty)
        setTime(500)
        instance.network.onMessage(user, empty)
        expect(user.connectionState).toBe(UserConnectionState.Open)
        instance.step()
        instance.network.onMessage(user, empty)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
    })

    it('does not reset rate credits when a handshake is accepted or the clock moves backwards', () => {
        const { instance, pending, setTime } = fixture({ packetBurst: 1, packetsPerSecond: 1 })
        setTime(1000)
        const user = pending()
        instance.network.onMessage(user, Buffer.alloc(0))
        instance.network.onConnectionAccepted(user, {})
        setTime(500)
        instance.network.onMessage(user, Buffer.alloc(0))
        expect(user.connectionState).toBe(UserConnectionState.Closed)
    })

    it('charges bytes separately and permits exact byte boundaries after refill', () => {
        const { instance, accepted, setTime, errors } = fixture({ maxPacketBytes: 2, byteBurst: 4, bytesPerSecond: 4 })
        const user = accepted()
        const packet = Buffer.from([BinarySection.EngineMessages, 0])
        instance.network.onMessage(user, packet)
        instance.network.onMessage(user, packet)
        setTime(500)
        instance.network.onMessage(user, packet)
        expect(user.connectionState).toBe(UserConnectionState.Open)
        instance.network.onMessage(user, packet)
        expect(errors.mock.calls[0][0].limit).toBe('byteBurst')
    })

    it.each([240, 360])('allows %i Hz flushes with 60 Hz commands and delayed delivery under defaults', fps => {
        const { instance, accepted, setTime, errors } = fixture()
        const user = accepted()
        instance.queue.clear()
        let delivered = 0
        const drain = () => {
            while (!instance.queue.isEmpty()) delivered += instance.queue.next().commands?.length ?? 0
        }
        for (let frame = 0; frame < fps * 10; frame++) {
            setTime(frame * 1000 / fps)
            instance.network.onMessage(user, frame % (fps / 60) === 0 ? commands(7) : Buffer.alloc(0))
            if ((frame + 1) % (fps / 20) === 0) drain()
        }
        // One second of delayed traffic arrives together; ticks cannot refill credits.
        setTime(11000)
        for (let frame = 0; frame < fps; frame++) {
            instance.network.onMessage(user, frame % (fps / 60) === 0 ? commands(8) : Buffer.alloc(0))
        }
        drain()
        expect(delivered).toBe(660)
        expect(errors).not.toHaveBeenCalled()
        expect(user.connectionState).toBe(UserConnectionState.Open)
        expect(instance.network.queuedInputBytes).toBe(0)
    })

    it('counts command objects across repeated sections before decoding over-budget commands', () => {
        const { instance, accepted, errors } = fixture({ maxQueuedCommandsPerUser: 2 })
        const user = accepted()
        instance.queue.clear()
        instance.network.onMessage(user, join(commands(1, 2), commands(3)))
        expect(errors.mock.calls[0][0].limit).toBe('maxQueuedCommandsPerUser')
        expect(user.queuedCommandCount).toBe(0)
        expect(instance.queue.arr.every(event => event.type !== NetworkEvent.CommandSet)).toBe(true)
    })

    it.each(['next', 'dequeue', 'removeWhere', 'clear'])('releases command and byte charges on %s', method => {
        const { instance, accepted } = fixture({ maxQueuedCommandsPerUser: 1 })
        const user = accepted()
        instance.queue.clear()
        instance.network.onMessage(user, commands(7))
        expect(user.queuedInputBytes).toBe(4)
        if (method === 'removeWhere') instance.queue.removeWhere(() => true)
        else (instance.queue[method as 'next' | 'dequeue' | 'clear'])()
        expect(user.queuedCommandCount).toBe(0)
        expect(instance.network.queuedInputBytes).toBe(0)
        instance.network.onMessage(user, commands(8))
        expect(user.connectionState).toBe(UserConnectionState.Open)
    })

    it('retains closed-user accounting across reconnects until old commands are drained', () => {
        const { instance, accepted, errors } = fixture({ maxQueuedCommands: 2 })
        const first = accepted()
        instance.network.onMessage(first, commands(1, 2))
        first.disconnect('test cleanup')
        const second = accepted()
        instance.network.onMessage(second, commands(3))
        expect(errors.mock.calls[0][0].limit).toBe('maxQueuedCommands')
        expect(instance.network.queuedCommandCount).toBe(2)
        instance.queue.clear()
        expect(instance.network.queuedCommandCount).toBe(0)
    })

    it('isolates a per-user excess and preserves healthy FIFO commands and snapshots', () => {
        const { instance, accepted } = fixture({ maxQueuedCommandsPerUser: 2 })
        const bad = accepted()
        const healthy = accepted()
        instance.network.onMessage(healthy, commands(10))
        instance.network.onMessage(bad, commands(1, 2))
        instance.network.onMessage(bad, commands(3))
        instance.network.onMessage(healthy, commands(11))
        const observed: number[] = []
        const router = new CommandRouter().on(1, ({ command }) => observed.push(command.value))
        while (!instance.queue.isEmpty()) router.process(instance.queue.next())
        expect(observed).toEqual([10, 11])
        instance.step()
        expect(healthy.lastSentInstanceTick).toBe(instance.tick)
        expect(instance.network.queuedInputBytes).toBe(0)
    })

    it.each(['maxQueuedInputBytesPerUser', 'maxQueuedInputBytes'] as const)('bounds %s and releases on drain', limit => {
        const { instance, accepted, errors } = fixture({ [limit]: 4 })
        const user = accepted()
        instance.network.onMessage(user, commands(1))
        instance.network.onMessage(user, commands(2))
        expect(errors.mock.calls[0][0].limit).toBe(limit)
        expect(instance.network.queuedInputBytes).toBe(4)
        instance.queue.clear()
        expect(instance.network.queuedInputBytes).toBe(0)
    })

    it.each(['maxQueuedRequestsPerUser', 'maxQueuedRequests'] as const)('bounds %s and purges request charges', limit => {
        const { instance, accepted, errors } = fixture({ [limit]: 1 })
        const user = accepted()
        instance.network.onMessage(user, request())
        expect(user.queuedRequestCount).toBe(1)
        instance.network.onMessage(user, request(2))
        expect(errors.mock.calls[0][0].limit).toBe(limit)
        expect(instance.network.requestQueue.length).toBe(0)
        expect(instance.network.queuedInputBytes).toBe(0)
    })

    it('accounts mixed command/request bytes conservatively and releases requests at handler start', () => {
        const { instance, accepted } = fixture()
        const user = accepted()
        const packet = join(commands(7), request())
        instance.network.onMessage(user, packet)
        expect(user.queuedInputBytes).toBe(24 + 18)
        instance.processRequests(1)
        expect(user.queuedInputBytes).toBe(24)
        instance.queue.clear()
        expect(user.queuedInputBytes).toBe(0)
    })

    it('releases partial-packet requests on malformed input without removing another user\'s request', () => {
        const { instance, accepted } = fixture()
        const healthy = accepted()
        const bad = accepted()
        instance.network.onMessage(healthy, request(1))
        instance.network.onMessage(bad, join(request(2), Buffer.from([255])))
        expect(instance.network.requestQueue.length).toBe(1)
        expect(instance.network.queuedInputBytes).toBe(18)
        instance.processRequests()
        expect(instance.network.queuedInputBytes).toBe(0)
    })

    it.each(['maxQueuedResponsesPerUser', 'maxQueuedResponses'] as const)('bounds %s even when requests are drained immediately', limit => {
        const { instance, accepted, errors } = fixture({ [limit]: 2 })
        const user = accepted()
        for (let i = 0; i < 3; i++) {
            instance.network.onMessage(user, request(i + 1))
            instance.processRequests(1)
        }
        expect(errors.mock.calls[0][0].limit).toBe(limit)
        expect(user.responseQueue.length).toBe(0)
        expect(instance.network.queuedResponseCount).toBe(0)
        expect(instance.network.queuedResponseBytes).toBe(0)
    })

    it.each(['maxQueuedResponseBytesPerUser', 'maxQueuedResponseBytes'] as const)('bounds %s before retaining an oversized reply', limit => {
        const { instance, accepted, errors } = fixture({ [limit]: 20 })
        const user = accepted()
        instance.network.queueResponse(user, 1, { endpoint: null, callback: () => undefined }, 'x'.repeat(30))
        expect(errors.mock.calls[0][0].limit).toBe(limit)
        expect(user.responseQueue).toHaveLength(0)
        expect(instance.network.queuedResponseBytes).toBe(0)
    })

    it('releases exactly the committed responses and then the rest on disconnect', () => {
        const { instance, accepted } = fixture()
        const user = accepted()
        for (let i = 0; i < 256; i++) instance.network.queueResponse(user, i, { endpoint: null, callback: () => undefined }, { ok: true })
        const bytes = 9 + countEndpointPayload(createEndpointPayload({ ok: true }))
        expect(instance.network.queuedResponseBytes).toBe(256 * bytes)
        instance.step()
        expect(instance.network.queuedResponseCount).toBe(1)
        expect(instance.network.queuedResponseBytes).toBe(bytes)
        user.disconnect('test cleanup')
        expect(instance.network.queuedResponseCount).toBe(0)
        expect(instance.network.queuedResponseBytes).toBe(0)
    })

    it('keeps schema response data and byte charges independent of later application edits', () => {
        const { instance, accepted } = fixture()
        const user = accepted()
        const endpoint = defineEndpoint(1, { responseSchema: definePayloadSchema({ values: Binary.UInt8Array }) })
        const value = { values: new Uint8Array([1, 2]) }
        instance.network.queueResponse(user, 1, { endpoint, callback: () => undefined }, value)
        value.values[0] = 99
        value.values = new Uint8Array(10000)
        const payload = user.responseQueue[0].payload
        expect(payload.kind === 'schema' && Array.from(payload.value.values)).toEqual([1, 2])
        expect(user.queuedResponseBytes).toBe(15)
        createSnapshotBuffer(user, instance)
        expect(user.queuedResponseBytes).toBe(0)
    })

    it('retains response charges after a snapshot write failure until disconnect cleanup', () => {
        const { instance, accepted, adapter } = fixture()
        const user = accepted()
        instance.network.queueResponse(user, 1, { endpoint: null, callback: () => undefined }, { ok: true })
        const bytes = user.queuedResponseBytes
        const createWriter = adapter.binary.createWriter.bind(adapter.binary)
        const write = jest.spyOn(adapter.binary, 'createWriter').mockImplementation(length => {
            const writer = createWriter(length)
            writer.writeFloat64 = () => { throw new Error('test write failure') }
            return writer
        })
        try {
            expect(() => createSnapshotBuffer(user, instance)).toThrow('test write failure')
            expect(instance.network.queuedResponseCount).toBe(1)
            expect(instance.network.queuedResponseBytes).toBe(bytes)
            expect(user.responseQueue).toHaveLength(1)
            user.disconnect('write failure')
            expect(instance.network.queuedResponseCount).toBe(0)
            expect(instance.network.queuedResponseBytes).toBe(0)
        } finally { write.mockRestore() }
    })

    it('settles an immediate local admission refusal before client.connect installs handlers', async () => {
        const { instance } = fixture({ maxPendingConnections: 1 })
        const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
        adapter.createMockConnect()
        const refused = adapter.createMockConnect()
        const client = new Client(instance.context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
        await expect(client.connect(refused.clientSocket)).rejects.toThrow(/closed/)
    })

    it('does not retain or re-admit a user closed synchronously during handshake acceptance send', async () => {
        const { instance, adapter, pending } = fixture()
        const user = pending()
        adapter.send.mockImplementation(() => instance.network.onClose(user))
        await instance.network.onHandshake(user, {})
        expect(instance.users.size).toBe(0)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
    })
})
