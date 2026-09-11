import {
    AABB2D, Binary, Channel, Client, Context, EcsChannel2D, Instance, LocalClientAdapter,
    LocalInstanceAdapter, defineEntitySchema
} from '../index'
import { testBinaryAdapter } from '../testSupport/BufferBinary'

async function setup() {
    const context = new Context()
    context.register(1, defineEntitySchema({ value: Binary.Float64 }))
    context.register(2, defineEntitySchema({ position: Binary.Vector2 }))
    context.register(3, defineEntitySchema({ x: Binary.Float64, y: Binary.Float64,
        $options: { updateGroups: { position: ['x', 'y'] } } }))
    const instance = new Instance(context)
    instance.onConnect = async () => true
    const adapter = new LocalInstanceAdapter(instance.network, { binary: testBinaryAdapter })
    const socket = adapter.createMockConnect()
    const client = new Client(context, LocalClientAdapter, 20, { binary: testBinaryAdapter })
    client.setDisconnectHandler(() => {})
    await client.connect(socket.clientSocket)
    const user = Array.from(instance.users.values())[0]
    const step = () => { instance.step(); client.network.drainFrames() }
    return { instance, client, user, step }
}

describe('network identity lifetime', () => {
    it.each([false, true])('replicates ECS creates, header changes and grouped writes across both width boundaries (shared=%s)', async shared => {
        const game = await setup()
        try {
            game.instance.network.sharedUpdateFragmentsEnabled = shared
            const channel = new EcsChannel2D(game.instance.localState, 10,
                { header: { nid: 0, ntype: 1, value: 0 } })
            channel.subscribe(game.user, new AABB2D(5, 5, 4, 4))
            const pid = channel.createEntity()
            const transform = channel.addSpatialComponent(pid, { nid: 0, ntype: 3, x: 5, y: 5 })
            const writer = channel.createComponentWriter(3, game.instance.context.getSchema(3))
            game.step()
            for (const [limit, width] of [[255, Binary.UInt16], [65535, Binary.UInt32]]) {
                // Reserve real allocator IDs without building an enormous
                // unrelated game world; encoding still uses actual wide IDs.
                while (game.instance.localState.nidPool.ids.size < limit) game.instance.localState.nextNetworkId()
                const ntype = limit + 1
                game.instance.context.register(ntype, defineEntitySchema({ value: Binary.UInt16 }))
                const added = channel.addComponent(pid, { nid: 0, ntype, value: 42 })
                transform.x++
                writer.groups.position(transform, transform.x, transform.y)
                channel.header.value++
                channel.syncHeader()
                game.step()
                expect(added.nid).toBeGreaterThan(limit)
                expect(game.client.network.protocol).toEqual({ nidType: width, ntypeType: width })
                expect(game.client.network.store.get(added.nid)).toMatchObject({ pid, ntype, value: 42 })
                expect(game.client.network.store.get(transform.nid)?.x).toBe(transform.x)
                expect(game.client.network.store.getChannelHeaderById(channel.nid)?.value).toBe(channel.header.value)
                const removedNid = added.nid
                channel.removeComponent(added)
                game.step()
                expect(game.client.network.store.get(removedNid)).toBeUndefined()
            }
        } finally { game.client.disconnect() }
    })

    it.each(['entity', 'channel header'])('reinitializes the diff baseline when a %s id changes schema', async kind => {
        const game = await setup()
        try {
            let channel = new Channel(game.instance.localState, kind === 'channel header'
                ? { header: { nid: 0, ntype: 1, value: 1 } } : {})
            channel.subscribe(game.user)
            const old = kind === 'entity' ? channel.addEntity({ nid: 0, ntype: 1, value: 1 }) : channel.header
            const nid = old.nid
            game.step()
            if (kind === 'entity') channel.removeEntity(old)
            else channel.destroy()
            game.step()
            game.instance.localState.nidPool.current = nid - 1
            const current = { nid: 0, ntype: 2, position: { x: 2, y: 3 } }
            if (kind === 'entity') channel.addEntity(current)
            else {
                channel = new Channel(game.instance.localState, { header: current })
                channel.subscribe(game.user)
            }
            expect(current.nid).toBe(nid)
            game.step()
            current.position.x = 5
            if (kind === 'channel header') channel.syncHeader()
            game.step()
            const received = kind === 'entity' ? game.client.network.store.get(nid)
                : game.client.network.store.getChannelHeaderById(nid)
            expect(received?.position).toEqual({ x: 5, y: 3 })
        } finally { game.client.disconnect() }
    })

    it('releases diff baselines for destroyed roots, children, and channel headers', async () => {
        const game = await setup()
        try {
            for (let i = 0; i < 100; i++) {
                const channel = new Channel(game.instance.localState, { header: { nid: 0, ntype: 1, value: i } })
                const root = channel.addEntity({ nid: 0, ntype: 1, value: i })
                game.instance.attachChild(root, { nid: 0, ntype: 1, value: i })
                channel.subscribe(game.user)
                game.step()
                channel.destroy()
                game.step()
                expect(Object.keys(game.instance.cache.cache)).toHaveLength(0)
                expect(game.instance.localState.nidPool.ids.size).toBe(0)
                expect(game.instance.localState.ownerByNid.size).toBe(0)
                expect(game.client.network.entityNTypes.size).toBe(0)
            }
            for (let i = 0; i < game.client.network.maxFrameHistory + 1; i++) game.step()
            expect(game.client.network.store.history.timelines.size).toBe(0)
        } finally { game.client.disconnect() }
    })
})
