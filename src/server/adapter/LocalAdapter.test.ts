import { Binary } from '../../common/binary/Binary'
import {
    defineEntitySchema,
    defineMessageSchema
} from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { NetworkEvent } from '../../common/binary/NetworkEvent'
import { Client } from '../../client/Client'
import { Instance } from '../Instance'
import { Channel } from '../channel/Channel'
import {
    LocalClientAdapter,
    LocalInstanceAdapter,
    SimulatedLocalClientAdapter,
    SimulatedLocalInstanceAdapter
} from './MockAdapter'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'

class TestEntity {
    nid = 0
    ntype = 1
    x = 5
    y = 10
}

function createContext() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float32,
        y: Binary.Float32
    }))
    context.register(99, defineMessageSchema({
        value: Binary.UInt8
    }))
    return context
}

describe('LocalAdapter', () => {
    it('uses the normal handshake and snapshot pipeline without a socket library', async () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.onConnect = async handshake => handshake.role === 'local'

        const serverAdapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
        serverAdapter.listen()
        const serverSocket = serverAdapter.createMockConnect()

        const client = new Client<LocalClientAdapter<Buffer, Buffer>>(
            context,
            LocalClientAdapter,
            20,
            { binary: testBinaryAdapter }
        )

        const result = await client.connect(serverSocket.clientSocket, { role: 'local' })
        expect(result.accepted).toBe(true)
        expect(instance.users.size).toBe(1)

        const channel = new Channel(instance.localState)
        const entity = channel.addEntity(new TestEntity())
        const user = Array.from(instance.users.values())[0]
        channel.subscribe(user)

        instance.step()
        const frame = client.network.processNextFrame()

        expect(frame).not.toBeNull()
        expect(frame!.requireChannel(channel.nid).createEntities.map(created => created.nid)).toEqual([entity.nid])
        expect(client.network.store.entities.get(entity.nid)).toMatchObject({
            nid: entity.nid,
            ntype: 1,
            x: 5,
            y: 10
        })
    })

    it('sends an empty handshake when connect is called without connection data', async () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.onConnect = async handshake => Object.keys(handshake).length === 0

        const serverAdapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
        const serverSocket = serverAdapter.createMockConnect()
        const client = new Client<LocalClientAdapter<Buffer, Buffer>>(
            context,
            LocalClientAdapter,
            20,
            { binary: testBinaryAdapter }
        )

        const result = await client.connect(serverSocket.clientSocket)

        expect(result.accepted).toBe(true)
        expect(instance.users.size).toBe(1)
    })

    it('rejects denied handshakes and closes the local socket pair', async () => {
        const context = createContext()
        const instance = new Instance(context)
        instance.onConnect = async () => false

        const serverAdapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
        const serverSocket = serverAdapter.createMockConnect()
        const client = new Client<LocalClientAdapter<Buffer, Buffer>>(
            context,
            LocalClientAdapter,
            20,
            { binary: testBinaryAdapter }
        )

        await expect(client.connect(serverSocket.clientSocket, { role: 'local' })).rejects.toMatchObject({
            message: 'Connection denied.'
        })

        expect(client.adapter.connected).toBe(false)
        expect(serverSocket.readyState).toBe(3)
        expect(serverSocket.clientSocket.readyState).toBe(3)
        expect(instance.users.size).toBe(0)
    })

    it('keeps a client alive without application flush while snapshots are processed', async () => {
        let nowMs = 0
        const context = createContext()
        const instance = new Instance(context, {
            now: () => nowMs,
            pingIntervalMs: 1000,
            pongTimeoutMs: 3000
        })
        instance.onConnect = async () => true
        const serverAdapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
        const serverSocket = serverAdapter.createMockConnect()
        const client = new Client<LocalClientAdapter<Buffer, Buffer>>(
            context,
            LocalClientAdapter,
            20,
            { binary: testBinaryAdapter },
            { now: () => nowMs }
        )

        await client.connect(serverSocket.clientSocket)
        expect(instance.queue.next().type).toBe(NetworkEvent.UserConnected)

        const commandFrameNumber = client.network.commandFrameNumber
        instance.step()
        nowMs = 1000
        instance.step()

        expect(instance.users.size).toBe(1)
        expect(client.network.commandFrameNumber).toBe(commandFrameNumber)

        nowMs = 2000
        instance.step()
        expect(instance.users.size).toBe(1)

        // Model a suspended runtime that no longer processes socket messages.
        serverSocket.clientSocket.adapter = null
        nowMs = 3000
        instance.step()
        nowMs = 4000
        instance.step()
        nowMs = 5000
        instance.step()

        expect(instance.users.size).toBe(0)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserDisconnected,
            reason: 'pong_timeout'
        })
        expect(instance.queue.length).toBe(0)
    })

    it('manually advances a delayed handshake, command, and snapshot through the protocol', async () => {
        let nowMs = 0
        const context = createContext()
        const instance = new Instance(context, { now: () => nowMs })
        instance.onConnect = async handshake => handshake.role === 'simulated'
        const serverAdapter = new SimulatedLocalInstanceAdapter(instance.network, {
            binary: testBinaryAdapter
        })
        const socket = serverAdapter.createSimulatedConnect({
            now: () => nowMs,
            conditions: {
                seed: 42,
                clientToServer: { latencyMs: 100 },
                serverToClient: { latencyMs: 50 }
            }
        })
        const client = new Client<SimulatedLocalClientAdapter<Buffer, Buffer>>(
            context,
            SimulatedLocalClientAdapter,
            20,
            { binary: testBinaryAdapter },
            { now: () => nowMs }
        )

        const connecting = client.connect(socket.clientSocket, { role: 'simulated' })
        nowMs = 99
        expect(socket.advance()).toBe(0)
        expect(instance.users.size).toBe(0)

        nowMs = 100
        expect(socket.advance()).toBe(1)
        await Promise.resolve()
        expect(instance.users.size).toBe(1)
        expect(socket.conditions.status().serverToClient.queued).toBe(1)

        nowMs = 149
        expect(socket.advance()).toBe(0)
        nowMs = 150
        expect(socket.advance()).toBe(1)
        await expect(connecting).resolves.toMatchObject({ accepted: true })

        client.addCommand({ ntype: 99, value: 7 })
        client.flush()
        nowMs = 249
        expect(socket.advance()).toBe(0)
        nowMs = 250
        expect(socket.advance()).toBe(1)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserConnected
        })
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.CommandSet,
            commands: [{ ntype: 99, value: 7 }]
        })

        const channel = new Channel(instance.localState)
        const entity = channel.addEntity(new TestEntity())
        channel.subscribe(Array.from(instance.users.values())[0])
        instance.step()
        nowMs = 299
        expect(socket.advance()).toBe(0)
        nowMs = 300
        expect(socket.advance()).toBe(1)

        const frame = client.network.processNextFrame()
        expect(frame?.requireChannel(channel.nid).createEntities[0].nid).toBe(entity.nid)
    })

    it('uses delayed Ping delivery to exercise the real Pong timeout path', async () => {
        let nowMs = 0
        const context = createContext()
        const instance = new Instance(context, {
            now: () => nowMs,
            pingIntervalMs: 1000,
            pongTimeoutMs: 3000
        })
        instance.onConnect = async () => true
        const serverAdapter = new SimulatedLocalInstanceAdapter(instance.network, {
            binary: testBinaryAdapter
        })
        const socket = serverAdapter.createSimulatedConnect({
            now: () => nowMs,
            conditions: { seed: 8 }
        })
        const client = new Client<SimulatedLocalClientAdapter<Buffer, Buffer>>(
            context,
            SimulatedLocalClientAdapter,
            20,
            { binary: testBinaryAdapter },
            { now: () => nowMs }
        )

        const connecting = client.connect(socket.clientSocket)
        socket.advance()
        await Promise.resolve()
        socket.advance()
        await connecting
        expect(instance.queue.next().type).toBe(NetworkEvent.UserConnected)

        socket.conditions.configure({
            seed: 8,
            serverToClient: { latencyMs: 4000 }
        })
        nowMs = 1000
        instance.step()
        nowMs = 2000
        instance.step()
        nowMs = 3000
        instance.step()
        nowMs = 4000
        instance.step()

        expect(instance.users.size).toBe(0)
        expect(instance.queue.next()).toMatchObject({
            type: NetworkEvent.UserDisconnected,
            reason: 'pong_timeout'
        })
        expect(socket.conditions.status().serverToClient.queued).toBe(0)
    })

    it('conditions automatic Pongs without requiring an application flush', async () => {
        let nowMs = 0
        const context = createContext()
        const instance = new Instance(context, {
            now: () => nowMs,
            pingIntervalMs: 1000,
            pongTimeoutMs: 3000
        })
        instance.onConnect = async () => true
        const serverAdapter = new SimulatedLocalInstanceAdapter(instance.network, {
            binary: testBinaryAdapter
        })
        const socket = serverAdapter.createSimulatedConnect({
            now: () => nowMs,
            conditions: { seed: 13 }
        })
        const client = new Client<SimulatedLocalClientAdapter<Buffer, Buffer>>(
            context,
            SimulatedLocalClientAdapter,
            20,
            { binary: testBinaryAdapter },
            { now: () => nowMs }
        )

        const connecting = client.connect(socket.clientSocket)
        socket.advance()
        await Promise.resolve()
        socket.advance()
        await connecting
        expect(instance.queue.next().type).toBe(NetworkEvent.UserConnected)

        socket.conditions.configure({
            seed: 13,
            clientToServer: { latencyMs: 100 },
            serverToClient: { latencyMs: 100 }
        })
        const commandFrameNumber = client.network.commandFrameNumber
        instance.step()

        nowMs = 100
        expect(socket.advance()).toBe(1)
        expect(socket.conditions.status().clientToServer.queued).toBe(1)
        nowMs = 200
        expect(socket.advance()).toBe(1)

        const user = Array.from(instance.users.values())[0]
        expect(user.lastPongReceivedAtMs).toBe(nowMs)
        expect(client.network.commandFrameNumber).toBe(commandFrameNumber)
    })
})
