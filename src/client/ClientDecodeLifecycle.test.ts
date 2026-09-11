import {
    Binary, Channel, Client, Context, EcsChannel, Instance,
    LocalClientAdapter, LocalInstanceAdapter, defineEntitySchema, type EcsNetworkComponent
} from '../index'
import { testBinaryAdapter } from '../testSupport/BufferBinary'

describe.each([false, true])('decoder lifecycle (ECS=%s)', useEcs => {
    it.each(['each frame', 'whole batch', 'partial batch', 'same snapshot'])(
        'preserves reopened entity and header types when applying %s', async cadence => {
            const context = new Context()
            context.register(1, defineEntitySchema({ x: Binary.Float64 }))
            context.register(2, defineEntitySchema({ label: Binary.String }))
            const instance = new Instance(context)
            instance.onConnect = async () => true
            const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
            const socket = adapter.createMockConnect()
            const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
            const errors: unknown[] = []
            client.setWebsocketErrorHandler(error => errors.push(error))
            client.setDisconnectHandler(() => {})
            await client.connect(socket.clientSocket)
            try {
                const user = Array.from(instance.users.values())[0]
                const options = { header: { nid: 0, ntype: 2, label: 'old' } }
                const channel = useEcs
                    ? new EcsChannel(instance.localState, options)
                    : new Channel(instance.localState, options)
                const entity = channel instanceof EcsChannel
                    ? channel.addComponent(channel.createEntity(), { nid: 0, ntype: 1, x: 0 })
                    : channel.addEntity({ nid: 0, ntype: 1, x: 0 })
                const writer = channel instanceof EcsChannel
                    ? channel.createComponentWriter(1, context.getSchema(1)) : undefined
                channel.subscribe(user)
                instance.step()
                client.network.drainFrames()

                channel.unsubscribe(user)
                if (cadence !== 'same snapshot') instance.step()
                if (cadence === 'each frame') client.network.drainFrames()
                channel.subscribe(user)
                instance.step()
                if (cadence === 'partial batch') {
                    expect(client.network.drainFrames(1)[0].closedChannels).toHaveLength(1)
                    expect(client.network.entityNTypes.get(entity.nid)).toBe(1)
                } else {
                    const frames = client.network.drainFrames()
                    if (cadence === 'same snapshot') {
                        expect(frames[0].closedChannels).toHaveLength(1)
                        expect(frames[0].openedChannels).toHaveLength(1)
                    }
                }

                entity.x = 25
                writer?.props.x(entity as EcsNetworkComponent, entity.x)
                channel.header.label = 'new'
                channel.syncHeader()
                instance.step()
                client.network.drainFrames()
                expect(errors).toEqual([])
                expect(client.network.store.get(entity.nid)?.x).toBe(25)
                expect(client.network.store.getChannelHeaderById(channel.nid)?.label).toBe('new')
                expect(client.network.entityNTypes.get(entity.nid)).toBe(1)
                expect(client.network.entityNTypes.get(channel.nid)).toBe(2)

                // Preserve replacement types without retaining dead IDs forever.
                channel.unsubscribe(user)
                instance.step()
                client.network.drainFrames()
                expect(client.network.entityNTypes.size).toBe(0)
            } finally { client.disconnect() }
        }
    )
})

test.each(['entity', 'channel'])('queued %s replacement can reuse IDs with a different schema', async replacement => {
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float64 }))
    context.register(2, defineEntitySchema({ label: Binary.String }))
    context.register(3, defineEntitySchema({ y: Binary.UInt8 }))
    const instance = new Instance(context)
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
    const socket = adapter.createMockConnect()
    const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
    const errors: unknown[] = []
    client.setWebsocketErrorHandler(error => errors.push(error))
    client.setDisconnectHandler(() => {})
    await client.connect(socket.clientSocket)
    try {
        const user = Array.from(instance.users.values())[0]
        let channel = new Channel(instance.localState, { header: { nid: 0, ntype: 2, label: 'old' } })
        const old = channel.addEntity({ nid: 0, ntype: 1, x: 1 })
        const entityId = old.nid
        const channelId = channel.nid
        channel.subscribe(user)
        instance.step()
        client.network.drainFrames()

        if (replacement === 'channel') channel.destroy()
        else channel.removeEntity(old)
        instance.step()
        // Force the allocator to wrap to the returned IDs at this valid tick boundary.
        instance.localState.nidPool.current = (replacement === 'channel' ? channelId : entityId) - 1
        if (replacement === 'channel') {
            channel = new Channel(instance.localState)
            expect(channel.nid).toBe(channelId)
            channel.subscribe(user)
        }
        const current = channel.addEntity({ nid: 0, ntype: 3, y: 5 })
        expect(current.nid).toBe(entityId)
        instance.step()
        client.network.drainFrames(1)
        current.y = 9
        instance.step()
        client.network.drainFrames()
        expect(errors).toEqual([])
        expect(client.network.store.get(entityId)).toMatchObject({ ntype: 3, y: 9 })
        expect(client.network.entityNTypes.get(entityId)).toBe(3)
        expect(client.network.entityNTypes.get(channelId)).toBe(replacement === 'channel' ? undefined : 2)

        channel.unsubscribe(user)
        instance.step()
        client.network.drainFrames()
        expect(client.network.entityNTypes.size).toBe(0)
    } finally { client.disconnect() }
})
