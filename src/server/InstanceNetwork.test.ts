import { Buffer } from 'buffer'
import { Binary } from '../common/binary/Binary'
import { BinarySection } from '../common/binary/BinarySection'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { defineMessageSchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { EngineMessage } from '../common/EngineMessage'
import { WIRE_PROTOCOL_VERSION } from '../common/binary/Protocol'
import { ClientNetwork } from '../client/ClientNetwork'
import { Predictor } from '../client/prediction/Predictor'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { Instance } from './Instance'
import { User, UserConnectionState } from './User'
import { Channel } from './channel/Channel'
import { EcsChannel2D } from './channel/EcsChannel2D'

function createOpenUser(instance: Instance) {
    const user = new User(undefined, {
        binary: testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    } as any)
    user.id = 1
    user.instance = instance
    user.connectionState = UserConnectionState.Open
    return user
}

function createClientNetwork(context: Context, now?: () => number) {
    const client = {
        context,
        now,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        disconnect: jest.fn(),
        predictor: new Predictor(),
        network: undefined as unknown as ClientNetwork
    }
    const network = new ClientNetwork(client as any)
    client.network = network
    return network
}

describe('InstanceNetwork', () => {
    it.each([[0, 0], [40, 0], [0, 40], [40, 40]])('excludes snapshot preparation (%i ms) and decode (%i ms) from clock sync', (preparationMs, decodeMs) => {
        let nowMs = 1000
        const context = new Context()
        const instance = new Instance(context, { now: () => nowMs })
        const user = createOpenUser(instance)
        const clientNetwork = createClientNetwork(context, () => nowMs - 900)
        user.roundTripMs = 20 // An established RTT estimate is sent in the Ping.
        user.networkAdapter.binary = {
            ...testBinaryAdapter,
            createWriter: bytes => {
                nowMs += preparationMs
                return testBinaryAdapter.createWriter(bytes)
            }
        }
        instance.users.set(user.id, user)
        ;(user.networkAdapter.send as jest.Mock).mockImplementation((_user, payload) => {
            const sentAtMs = nowMs
            expect(user.lastPingSentAtMs).toBe(sentAtMs)
            nowMs += 10
            const reader = testBinaryAdapter.createReader(payload)
            const readFloat64 = reader.readFloat64.bind(reader)
            reader.readFloat64 = () => {
                nowMs += decodeMs
                reader.readFloat64 = readFloat64
                return readFloat64()
            }
            clientNetwork.readSnapshot(reader)
            // Return the encoded Pong within send(), as a local transport may.
            clientNetwork.flushPongs(testBinaryAdapter, pong => {
                nowMs += 10
                instance.network.onMessage(user, pong)
            })
        })
        instance.step()
        expect(clientNetwork.processNextFrame()!.serverTimeMs).toBe(1000)
        expect(user.roundTripMs).toBe(20)
        expect(user.clockOffsetMs).toBe(900)
        expect(user.clockSyncSamples).toBe(1)
        expect(user.pendingPings.size).toBe(0)
        expect(clientNetwork.getEstimatedServerTimeMs()).toBe(nowMs)
    })

    it.each([false, true])('falls back to termination after close throws (termination throws=%s)', terminationThrows => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.network.onConnectionAccepted(user, {})
        instance.queue.next()
        const channel = new Channel(instance.localState)
        channel.subscribe(user)
        const close = user.networkAdapter.disconnect as jest.Mock
        close.mockImplementation(() => { throw new Error('close payload cannot be encoded') })
        const terminate = jest.fn(() => {
            expect(instance.users.size).toBe(0)
            expect(user.subscriptions.size).toBe(0)
            instance.network.onClose(user)
            if (terminationThrows) throw new Error('transport already broken')
        })
        user.networkAdapter.terminate = terminate
        expect(() => user.disconnect('kick')).not.toThrow()
        expect(terminate).toHaveBeenCalledTimes(1)
        user.disconnect('repeat')
        expect(terminate).toHaveBeenCalledTimes(1)
        expect(instance.queue.next()).toMatchObject({ type: NetworkEvent.UserDisconnected, user, reason: 'kick' })
        expect(instance.queue.isEmpty()).toBe(true)
    })

    it('does not retry a failed forced termination', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.network.onConnectionAccepted(user, {})
        const terminate = jest.fn(() => { throw new Error('transport already broken') })
        user.networkAdapter.terminate = terminate
        expect(() => instance.network.disconnectUser(user, 'failure', true)).not.toThrow()
        expect(terminate).toHaveBeenCalledTimes(1)
        expect(user.networkAdapter.disconnect).not.toHaveBeenCalled()
    })

    it.each(['delayed', 'throwing', 'reentrant'])('cleans up a public disconnect before a %s transport close', mode => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.network.onConnectionAccepted(user, {})
        instance.queue.next()
        const channel = new Channel(instance.localState)
        channel.subscribe(user)
        const requestClient = createClientNetwork(instance.context)
        requestClient.request(1, {}, { timeoutMs: 0 }).catch(() => undefined)
        instance.network.onMessage(user, requestClient.createOutbound(testBinaryAdapter))
        requestClient.rejectPendingRequests(new Error('test cleanup'))
        const close = user.networkAdapter.disconnect as jest.Mock
        let stateDuringClose: unknown
        close.mockImplementation(() => {
            stateDuringClose = {
                connectionState: user.connectionState,
                registered: instance.users.has(user.id),
                subscriptions: user.subscriptions.size,
                requests: instance.network.requestQueue.length
            }
            if (mode === 'throwing') throw new Error('broken socket')
            if (mode === 'reentrant') {
                user.disconnect('recursive close')
                instance.network.onClose(user, 'transport reason')
            }
        })

        expect(() => user.disconnect('kick')).not.toThrow()
        expect(stateDuringClose).toEqual({
            connectionState: UserConnectionState.Closed, registered: false, subscriptions: 0, requests: 0
        })
        expect(close).toHaveBeenCalledTimes(1)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        instance.network.onClose(user, 'late callback')
        user.disconnect('repeated kick')
        expect(close).toHaveBeenCalledTimes(1)
        expect(instance.queue.next()).toMatchObject({ type: NetworkEvent.UserDisconnected, user, reason: 'kick' })
        expect(instance.queue.isEmpty()).toBe(true)
    })

    it('disconnects open users after the Pong deadline', () => {
        let nowMs = 0
        const instance = new Instance(new Context(), {
            now: () => nowMs,
            pingIntervalMs: 1000,
            pongTimeoutMs: 3000
        })
        const user = createOpenUser(instance)
        instance.users.set(user.id, user)

        instance.step()
        expect(user.lastPingSentAtMs).toBe(0)

        nowMs = 1000
        instance.step()
        nowMs = 2000
        instance.step()
        expect(user.connectionState).toBe(UserConnectionState.Open)

        nowMs = 3000
        instance.step()

        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, { reason: 'pong_timeout' })
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.users.has(user.id)).toBe(false)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserDisconnected,
            user,
            reason: 'pong_timeout'
        })
    })

    it('disconnects sockets that never send their initial handshake', () => {
        let nowMs = 0
        const instance = new Instance(new Context(), {
            now: () => nowMs,
            handshakeTimeoutMs: 2000
        })
        const user = new User(undefined, {
            binary: testBinaryAdapter,
            send: jest.fn(),
            disconnect: jest.fn()
        } as any)

        instance.network.onOpen(user)
        nowMs = 2000
        instance.step()

        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, { reason: 'handshake_timeout' })
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.network.pendingUsers.has(user)).toBe(false)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserConnectionDenied,
            user,
            payload: { reason: 'handshake_timeout' }
        })
        expect(instance.queue.length).toBe(0)
    })

    it('times out a handshake while the user onConnect handler is unresolved', async () => {
        let nowMs = 0
        let resolveConnect!: (value: any) => void
        const instance = new Instance(new Context(), {
            now: () => nowMs,
            handshakeTimeoutMs: 2000
        })
        instance.onConnect = () => new Promise(resolve => {
            resolveConnect = resolve
        })
        const user = new User(undefined, {
            binary: testBinaryAdapter,
            send: jest.fn(),
            disconnect: jest.fn()
        } as any)

        instance.network.onOpen(user)
        const handshake = instance.network.onHandshake(user, {})
        await Promise.resolve()

        nowMs = 2000
        instance.step()

        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserConnectionDenied,
            user,
            payload: { reason: 'handshake_timeout' }
        })

        resolveConnect(true)
        await handshake
        expect(instance.users.size).toBe(0)
        expect(instance.queue.length).toBe(0)
    })

    it('rejects a mismatched wire protocol before calling user code', async () => {
        const instance = new Instance(new Context())
        const onConnect = jest.fn(async () => true)
        instance.onConnect = onConnect
        const user = new User(undefined, {
            binary: testBinaryAdapter,
            send: jest.fn(),
            disconnect: jest.fn()
        } as any)

        instance.network.onOpen(user)
        await instance.network.onHandshake(user, {}, '', WIRE_PROTOCOL_VERSION + 1)

        expect(onConnect).not.toHaveBeenCalled()
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserConnectionDenied,
            user
        })
        expect(instance.queue.length).toBe(0)
    })

    it('denies rather than disconnects when the acceptance response cannot be sent', async () => {
        const instance = new Instance(new Context())
        instance.onConnect = async () => true
        const user = new User(undefined, {
            binary: testBinaryAdapter,
            send: jest.fn(() => {
                throw new Error('acceptance send failed')
            }),
            disconnect: jest.fn()
        } as any)

        instance.network.onOpen(user)
        await instance.network.onHandshake(user, {})

        expect(instance.users.size).toBe(0)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserConnectionDenied,
            user
        })
        expect(instance.queue.length).toBe(0)
    })

    it('observes malformed inbound messages and disconnects without exposing the payload', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        const onInboundMessageError = jest.fn()
        instance.onInboundMessageError = onInboundMessageError

        instance.network.onMessage(user, Buffer.from([BinarySection.EngineMessages]))

        expect(onInboundMessageError).toHaveBeenCalledTimes(1)
        expect(onInboundMessageError).toHaveBeenCalledWith(expect.objectContaining({
            user,
            byteLength: 1,
            connectionState: UserConnectionState.Open
        }))
        expect(onInboundMessageError.mock.calls[0][0]).not.toHaveProperty('payload')
        expect(onInboundMessageError.mock.calls[0][0]).not.toHaveProperty('buffer')
        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
    })

    it.each(['unknown section', 'truncated command', 'duplicate handshake', 'early request'])('validates a whole handshake packet before onConnect: %s', async suffix => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.network.onOpen(user)
        const client = createClientNetwork(instance.context)
        const handshake = client.createHandshake({ account: 'test' }, testBinaryAdapter) as Buffer
        let tail = suffix === 'duplicate handshake' ? handshake : suffix === 'unknown section'
            ? Buffer.from([255]) : Buffer.from([BinarySection.Commands])
        if (suffix === 'early request') {
            client.request(1, {}, { timeoutMs: 0 }).catch(() => undefined)
            tail = client.createOutbound(testBinaryAdapter) as Buffer
            client.rejectPendingRequests(new Error('test cleanup'))
        }
        instance.onConnect = jest.fn(async () => true)
        const error = jest.fn()
        instance.onInboundMessageError = error
        instance.network.onMessage(user, Buffer.from([...handshake, ...tail]))
        await Promise.resolve()
        expect(instance.onConnect).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalledTimes(1)
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.users.size).toBe(0)
        expect(instance.network.pendingUsers.size).toBe(0)
        expect(user.networkAdapter.send).not.toHaveBeenCalled()
    })

    it('contains malformed command/request suffixes without discarding another user\'s work', () => {
        const context = new Context()
        context.register(1, defineMessageSchema({ value: Binary.UInt8 }))
        const instance = new Instance(context)
        const bad = createOpenUser(instance)
        const healthy = createOpenUser(instance)
        instance.network.onConnectionAccepted(bad, {})
        instance.network.onConnectionAccepted(healthy, {})
        const channel = new Channel(instance.localState)
        channel.subscribe(bad)
        channel.subscribe(healthy)
        const handler = jest.fn((request: any) => ({ ok: request.body.value === 7 }))
        instance.respond(1, handler)
        for (const [user, value] of [[healthy, 7], [bad, 8]] as const) {
            const client = createClientNetwork(context)
            client.addCommand({ ntype: 1, value })
            client.request(1, { value }, { timeoutMs: 0 }).catch(() => undefined)
            const packet = client.createOutbound(testBinaryAdapter) as Buffer
            instance.network.onMessage(user, user === bad ? Buffer.from([...packet, 255]) : packet)
        }
        expect(bad.connectionState).toBe(UserConnectionState.Closed)
        expect(bad.subscriptions.size).toBe(0)
        expect(instance.users.has(bad.id)).toBe(false)
        expect(healthy.connectionState).toBe(UserConnectionState.Open)
        expect(healthy.subscriptions.get(channel.nid)).toBe(channel)
        const commands = instance.queue.arr.filter(event => event.type === NetworkEvent.CommandSet)
        expect(commands).toHaveLength(1)
        expect(commands[0]).toMatchObject({ user: healthy, commands: [{ ntype: 1, value: 7 }] })
        expect(instance.network.requestQueue.length).toBe(1)
        expect(instance.processRequests()).toBe(1)
        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler.mock.calls[0][0]).toMatchObject({ user: healthy, body: { value: 7 } })
        expect(() => instance.step()).not.toThrow()
        expect(healthy.networkAdapter.send).toHaveBeenCalledTimes(1)
        expect(bad.networkAdapter.send).not.toHaveBeenCalled()
    })

    it('ignores packets arriving after logical disconnect without accumulating responses', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.network.onConnectionAccepted(user, {})
        instance.network.disconnectUser(user, 'closed')
        const client = createClientNetwork(instance.context)
        client.request(1, {}, { timeoutMs: 0 }).catch(() => undefined)
        const packet = client.createOutbound(testBinaryAdapter)
        const error = jest.fn()
        instance.onInboundMessageError = error
        const read = jest.spyOn(user.networkAdapter.binary, 'createReader')
        try {
            for (let i = 0; i < 3; i++) instance.network.onMessage(user, packet)
            instance.network.onMessage(user, Buffer.from([255]))
            expect(read).not.toHaveBeenCalled()
            expect(error).not.toHaveBeenCalled()
            expect(user.responseQueue).toEqual([])
            expect(instance.network.requestQueue.length).toBe(0)
            expect(user.networkAdapter.disconnect).toHaveBeenCalledTimes(1)
        } finally {
            read.mockRestore()
        }
    })

    it('does not let inbound error observers crash the server edge', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.onInboundMessageError = () => {
            throw new Error('observer failed')
        }

        expect(() => {
            instance.network.onMessage(user, Buffer.from([BinarySection.EngineMessages]))
        }).not.toThrow()
        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
    })

    it('rejects unknown binary sections through inbound error handling', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        const onInboundMessageError = jest.fn()
        instance.onInboundMessageError = onInboundMessageError

        instance.network.onMessage(user, Buffer.from([255]))

        expect(onInboundMessageError).toHaveBeenCalledWith(expect.objectContaining({
            user,
            byteLength: 1
        }))
        expect(onInboundMessageError.mock.calls[0][0].error).toMatchObject({
            name: 'ProtocolError'
        })
        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
    })

    it('rejects commands received before the connection is open', () => {
        const context = new Context()
        context.register(1, defineMessageSchema({
            value: Binary.UInt8
        }))
        const instance = new Instance(context)
        const user = createOpenUser(instance)
        user.connectionState = UserConnectionState.OpenAwaitingHandshake
        const clientNetwork = createClientNetwork(context)

        clientNetwork.addCommand({ ntype: 1, value: 7 })
        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))

        expect(instance.queue.length).toBe(0)
        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
        expect(user.connectionState).toBe(UserConnectionState.Closed)
    })

    it('does not enqueue command events for engine-only packets', () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createOpenUser(instance)
        const clientNetwork = createClientNetwork(context)

        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))

        expect(instance.queue.length).toBe(0)
    })

    it('does not accept a handshake packet that also contains pre-open commands', async () => {
        const context = new Context()
        context.register(1, defineMessageSchema({
            value: Binary.UInt8
        }))
        const instance = new Instance(context)
        const user = createOpenUser(instance)
        user.connectionState = UserConnectionState.OpenPreHandshake
        const clientNetwork = createClientNetwork(context)
        instance.onConnect = async () => true

        clientNetwork.addCommand({ ntype: 1, value: 7 })
        const handshake = clientNetwork.createHandshake({}, testBinaryAdapter) as Buffer
        const outbound = clientNetwork.createOutbound(testBinaryAdapter) as Buffer
        const buffer = Buffer.allocUnsafe(handshake.length + outbound.length)
        for (let i = 0; i < handshake.length; i++) {
            buffer[i] = handshake[i]
        }
        for (let i = 0; i < outbound.length; i++) {
            buffer[handshake.length + i] = outbound[i]
        }
        instance.network.onMessage(user, buffer)
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
        expect(user.networkAdapter.send).not.toHaveBeenCalled()
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.queue.length).toBe(0)
    })

    it('closes denied handshakes after sending the denial response', async () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        user.connectionState = UserConnectionState.OpenPreHandshake
        instance.onConnect = async () => false

        await instance.network.onHandshake(user, {})

        expect(user.networkAdapter.send).toHaveBeenCalled()
        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        const event = instance.queue.next()
        expect(event.type).toBe(NetworkEvent.UserConnectionDenied)
        expect(event.user).toBe(user)
    })

    it('queues accepted handshake payload on the UserConnected event', async () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        user.connectionState = UserConnectionState.OpenPreHandshake
        instance.onConnect = async handshake => ({
            accountId: 'account-7',
            characterId: handshake.characterId,
            isAdmin: true
        })

        await instance.network.onHandshake(user, {
            token: 'secret',
            characterId: 'knight'
        })

        expect(user.connectionState).toBe(UserConnectionState.Open)
        const event = instance.queue.next()
        expect(event.type).toBe(NetworkEvent.UserConnected)
        expect(event.user).toBe(user)
        expect(event.payload).toEqual({
            accountId: 'account-7',
            characterId: 'knight',
            isAdmin: true
        })
    })

    it('does not log handshake contents from the default onConnect handler', async () => {
        const instance = new Instance(new Context())
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

        await instance.onConnect({
            token: 'secret-token',
            characterId: 'knight'
        })

        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).not.toContain('secret-token')
        expect(warn.mock.calls[0][0]).not.toContain('knight')
        warn.mockRestore()
    })

    it('treats a second handshake from an open user as a disconnecting protocol violation', async () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        instance.users.set(user.id, user)
        instance.onConnect = async () => true

        await instance.network.onHandshake(user, {})

        expect(user.networkAdapter.disconnect).toHaveBeenCalledWith(user, {})
        expect(user.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.users.has(user.id)).toBe(false)
        const event = instance.queue.next()
        expect(event.type).toBe(NetworkEvent.UserDisconnected)
        expect(event.user).toBe(user)
        expect(instance.queue.length).toBe(0)
    })

    it('does not run queued requests for users that disconnect before request processing', () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createOpenUser(instance)
        const clientNetwork = createClientNetwork(context)
        const handler = jest.fn(() => ({ ok: true }))
        instance.respond(1, handler)

        clientNetwork.request(1, { text: 'queued' }, { timeoutMs: 0 }).catch(() => undefined)
        instance.network.onMessage(user, clientNetwork.createOutbound(testBinaryAdapter))
        expect(instance.network.requestQueue.length).toBe(1)

        instance.network.onClose(user)

        expect(instance.network.requestQueue.length).toBe(0)
        expect(instance.processRequests()).toBe(0)
        expect(handler).not.toHaveBeenCalled()
    })

    it('removes a disconnected user from every subscribed channel', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        const channel = new Channel(instance.localState)
        const spatialChannel = new EcsChannel2D(instance.localState, 100)
        instance.users.set(user.id, user)

        channel.subscribe(user)
        spatialChannel.subscribe(user, {
            x: 0,
            y: 0,
            halfWidth: 100,
            halfHeight: 100
        })

        expect(user.subscriptions.size).toBe(2)
        expect(channel.users.has(user.id)).toBe(true)
        expect(spatialChannel.users.has(user.id)).toBe(true)
        expect((spatialChannel as any).views.has(user.id)).toBe(true)
        expect((spatialChannel as any).viewVersions.has(user.id)).toBe(true)
        spatialChannel.prepareVisibilityPlan(1)
        expect((spatialChannel as any).visibleCellKeyCache.has(user.id)).toBe(true)
        expect((spatialChannel as any).visibleNetworkedNidsCache.has(user.id)).toBe(true)
        expect((spatialChannel as any).visibilityStateByUser.has(user.id)).toBe(true)
        expect((spatialChannel as any).visibilityPlan).not.toBeNull()

        instance.network.onClose(user, 'transport_closed')
        instance.network.onClose(user, 'duplicate_close')

        expect(user.subscriptions.size).toBe(0)
        expect(channel.users.has(user.id)).toBe(false)
        expect(spatialChannel.users.has(user.id)).toBe(false)
        expect((spatialChannel as any).views.has(user.id)).toBe(false)
        expect((spatialChannel as any).viewVersions.has(user.id)).toBe(false)
        expect((spatialChannel as any).visibleCellKeyCache.has(user.id)).toBe(false)
        expect((spatialChannel as any).visibleNetworkedNidsCache.has(user.id)).toBe(false)
        expect((spatialChannel as any).visibilityStateByUser.has(user.id)).toBe(false)
        expect((spatialChannel as any).visibilityPlan).toBeNull()
        expect(instance.users.has(user.id)).toBe(false)
        expect(instance.queue.length).toBe(1)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserDisconnected,
            user,
            reason: 'transport_closed'
        })
    })

    it('keeps channel subscription state bounded through repeated disconnect churn', () => {
        const instance = new Instance(new Context())
        const channel = new Channel(instance.localState)
        const spatialChannel = new EcsChannel2D(instance.localState, 100)

        for (let i = 1; i <= 1000; i++) {
            const user = createOpenUser(instance)
            user.id = i
            instance.users.set(user.id, user)
            channel.subscribe(user)
            spatialChannel.subscribe(user, {
                x: i % 100,
                y: i % 100,
                halfWidth: 100,
                halfHeight: 100
            })
            spatialChannel.prepareVisibilityPlan(i)

            instance.network.onClose(user, 'churn')
            expect(instance.queue.next()).toMatchObject({
                type: NetworkEvent.UserDisconnected,
                user
            })
        }

        expect(instance.users.size).toBe(0)
        expect(channel.users.size).toBe(0)
        expect(spatialChannel.users.size).toBe(0)
        expect((spatialChannel as any).views.size).toBe(0)
        expect((spatialChannel as any).viewVersions.size).toBe(0)
        expect((spatialChannel as any).visibleCellKeyCache.size).toBe(0)
        expect((spatialChannel as any).visibleNetworkedNidsCache.size).toBe(0)
        expect((spatialChannel as any).visibilityStateByUser.size).toBe(0)
        expect((spatialChannel as any).visibilityPlan).toBeNull()
        expect(instance.queue.length).toBe(0)
    })

    it('rejects duplicate response endpoint registration', () => {
        const instance = new Instance(new Context())

        instance.respond(12, () => ({ ok: true }))

        expect(() => instance.respond(12, () => ({ ok: false }))).toThrow(
            'Response endpoint 12 is already registered.'
        )
    })

    it('skips stale queued requests when processing if the user is no longer open', () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        const handler = jest.fn(() => ({ ok: true }))
        instance.respond(1, handler)
        const endpoint = instance.responseEndPoints.get(1)!

        instance.network.requestQueue.enqueue({
            user,
            requestId: 1,
            endpointId: 1,
            endpoint,
            body: {}
        })
        user.connectionState = UserConnectionState.Closed

        expect(instance.processRequests()).toBe(1)
        expect(handler).not.toHaveBeenCalled()
    })

    it('does not queue async request responses after the user disconnects', async () => {
        const instance = new Instance(new Context())
        const user = createOpenUser(instance)
        let resolveHandler!: (value: any) => void
        instance.respond(1, () => new Promise(resolve => {
            resolveHandler = resolve
        }))
        const endpoint = instance.responseEndPoints.get(1)!

        instance.network.requestQueue.enqueue({
            user,
            requestId: 1,
            endpointId: 1,
            endpoint,
            body: {}
        })
        expect(instance.processRequests()).toBe(1)

        instance.network.onClose(user)
        resolveHandler({ ok: true })
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(user.responseQueue).toHaveLength(0)
    })

    it('disconnects only the failed user when a snapshot send throws during instance step', () => {
        const instance = new Instance(new Context())
        const failedUser = createOpenUser(instance)
        const goodUser = createOpenUser(instance)
        goodUser.id = 2
        const onSnapshotSendError = jest.fn()
        const clearBroadcastMessages = jest.fn()
        const clearSnapshotDeltas = jest.fn()
        instance.onSnapshotSendError = onSnapshotSendError
        instance.users.set(failedUser.id, failedUser)
        instance.users.set(goodUser.id, goodUser)
        instance.localState.channels.add({
            clearBroadcastMessages,
            clearSnapshotDeltas
        } as any)
        ;(failedUser.networkAdapter.send as jest.Mock).mockImplementation(() => {
            throw new Error('send failed')
        })

        expect(() => instance.step()).not.toThrow()
        expect(onSnapshotSendError).toHaveBeenCalledWith(expect.objectContaining({
            user: failedUser,
            byteLength: expect.any(Number),
            tick: instance.tick
        }))
        expect(onSnapshotSendError.mock.calls[0][0]).not.toHaveProperty('payload')
        expect(onSnapshotSendError.mock.calls[0][0]).not.toHaveProperty('buffer')
        expect(failedUser.networkAdapter.disconnect).toHaveBeenCalledWith(failedUser, {})
        expect(failedUser.connectionState).toBe(UserConnectionState.Closed)
        expect(instance.users.has(failedUser.id)).toBe(false)
        expect(goodUser.networkAdapter.send).toHaveBeenCalled()
        expect(goodUser.connectionState).toBe(UserConnectionState.Open)
        expect(goodUser.lastSentInstanceTick).toBe(instance.tick)
        const event = instance.queue.next()
        expect(event.type).toBe(NetworkEvent.UserDisconnected)
        expect(event.user).toBe(failedUser)
        expect(instance.queue.length).toBe(0)
        expect(clearBroadcastMessages).toHaveBeenCalled()
        expect(clearSnapshotDeltas).toHaveBeenCalled()
    })

    it('sends snapshot timestamps and ping server times in the same server time domain', () => {
        const context = new Context()
        const instance = new Instance(context)
        const user = createOpenUser(instance)
        const clientNetwork = createClientNetwork(context)
        instance.users.set(user.id, user)

        instance.step()

        const send = user.networkAdapter.send as jest.Mock
        const sentBuffer = send.mock.calls[0][1] as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(sentBuffer))
        const frame = clientNetwork.drainFrames()[0]
        const outbound = clientNetwork.createOutbound(testBinaryAdapter)
        const pongCommands = clientNetwork.outbound.outboundEngineCommands.get(1)
        const pong = pongCommands?.find(command => command.ntype === EngineMessage.Pong) as { pingId: number } | undefined

        expect(frame.serverTimeMs).toBeGreaterThan(0)
        expect(pong?.pingId).toBeGreaterThan(0)
        expect(pong).not.toHaveProperty('serverTimeMs')
        expect(clientNetwork.getClockSync().samples).toBe(1)
        expect(clientNetwork.getEstimatedServerTimeMs()).not.toBeNull()
        expect(outbound.byteLength).toBeGreaterThan(0)
    })

    it('flushes Pongs without advancing application command frames and retries failed sends', () => {
        let nowMs = 1000
        const context = new Context()
        const instance = new Instance(context, { now: () => nowMs })
        const user = createOpenUser(instance)
        const clientNetwork = createClientNetwork(context)
        instance.users.set(user.id, user)

        instance.step()
        const send = user.networkAdapter.send as jest.Mock
        const snapshot = send.mock.calls[0][1] as Buffer
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(snapshot))
        const commandFrameNumber = clientNetwork.commandFrameNumber

        expect(() => clientNetwork.flushPongs(testBinaryAdapter, () => {
            throw new Error('send failed')
        })).toThrow('send failed')
        expect(clientNetwork.commandFrameNumber).toBe(commandFrameNumber)

        nowMs = 1010
        expect(clientNetwork.flushPongs(testBinaryAdapter, payload => {
            instance.network.onMessage(user, payload)
        })).toBe(1)
        expect(clientNetwork.flushPongs(testBinaryAdapter, () => undefined)).toBe(0)
        expect(clientNetwork.commandFrameNumber).toBe(commandFrameNumber)
        expect(user.lastPongReceivedAtMs).toBe(nowMs)
    })

    it('splits Pong-only traffic into valid one-byte message-count packets', () => {
        const context = new Context()
        const clientNetwork = createClientNetwork(context)
        const payloads: Buffer[] = []
        ;(clientNetwork as any).pendingPongs = Array.from({ length: 300 }, (_, index) => ({
            pingId: index + 1,
            clientReceiveTimeMs: index
        }))

        expect(clientNetwork.flushPongs(testBinaryAdapter, payload => payloads.push(payload))).toBe(300)
        expect(payloads).toHaveLength(2)

        const first = testBinaryAdapter.createReader(payloads[0])
        expect(first.readUInt8()).toBe(BinarySection.EngineMessages)
        expect(first.readUInt8()).toBe(255)
        const second = testBinaryAdapter.createReader(payloads[1])
        expect(second.readUInt8()).toBe(BinarySection.EngineMessages)
        expect(second.readUInt8()).toBe(45)
        expect(clientNetwork.flushPongs(testBinaryAdapter, () => undefined)).toBe(0)
    })
})
