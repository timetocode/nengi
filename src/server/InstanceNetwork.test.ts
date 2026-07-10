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

function createClientNetwork(context: Context) {
    const client = {
        context,
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
})
