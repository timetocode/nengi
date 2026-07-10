import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { NetworkEvent } from '../../common/binary/NetworkEvent'
import { Client } from '../../client/Client'
import { Instance } from '../Instance'
import { Channel } from '../channel/Channel'
import { LocalClientAdapter, LocalInstanceAdapter } from './MockAdapter'
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

    it('keeps a flushing client alive and disconnects it after Pongs stop', async () => {
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

        instance.step()
        client.flush()
        nowMs = 1000
        instance.step()
        client.flush()

        expect(instance.users.size).toBe(1)

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
        expect(instance.queue.length).toBe(0)
    })
})
