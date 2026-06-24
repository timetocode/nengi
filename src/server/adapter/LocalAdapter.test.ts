import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
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
})
