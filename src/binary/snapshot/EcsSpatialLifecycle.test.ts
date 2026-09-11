import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { Client } from '../../client/Client'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { EcsChannel2D } from '../../server/channel/EcsChannel2D'
import { EcsChannel3D } from '../../server/channel/EcsChannel3D'
import { AABB2D } from '../../server/channel/AABB2D'
import { AABB3D } from '../../server/channel/AABB3D'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'

class ClientAdapter {
    binary = testBinaryAdapter
    connect() { return Promise.resolve({ accepted: true }) }
    flush() {}
}

function setup(dimensions: number, shared: boolean) {
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float64, y: Binary.Float64, z: Binary.Float64 }))
    context.register(2, defineEntitySchema({ hp: Binary.UInt16, shield: Binary.UInt16,
        $options: { updateGroups: { vitals: ['hp', 'shield'] } } }))
    const instance = new Instance(context)
    instance.network.sharedUpdateFragmentsEnabled = shared
    const channel = dimensions === 2
        ? new EcsChannel2D(instance.localState, 10)
        : new EcsChannel3D(instance.localState, 10)
    const users = [1, 2].map(id => {
        const user = new User(undefined, { binary: testBinaryAdapter, send: jest.fn(), disconnect: jest.fn() } as any)
        user.id = id
        user.instance = instance
        instance.users.set(id, user)
        if (channel instanceof EcsChannel2D) channel.subscribe(user, new AABB2D(5, 5, 4, 4))
        else channel.subscribe(user, new AABB3D(5, 5, 5, 4, 4, 4))
        return user
    })
    const clients = users.map(() => new Client(context, ClientAdapter, 20))
    const transform = (pid: number, spatial = true) => channel.addComponent(pid, {
        nid: 0, ntype: 1, x: 5, y: 5, z: 5
    }, { spatial })
    const step = () => {
        instance.step()
        return clients.map((client, i) => {
            const send = users[i].networkAdapter.send as jest.Mock
            const buffer = send.mock.calls[send.mock.calls.length - 1][1]
            // Let malformed output fail this test directly rather than taking
            // the production decoder's disconnect/diagnostics path.
            client.network.readSnapshotUnsafe(testBinaryAdapter.createReader(buffer))
            return client.network.processNextFrame()!
        })
    }
    return { context, instance, channel, users, clients, transform, step }
}

describe.each([{ dimensions: 2, shared: false }, { dimensions: 2, shared: true },
    { dimensions: 3, shared: false }, { dimensions: 3, shared: true }])(
    'ECS spatial component lifecycle: dimensions=$dimensions shared=$shared', ({ dimensions, shared }) => {
        it('makes an existing nonspatial root visible when its component is selected as spatial', () => {
            const game = setup(dimensions, shared)
            game.transform(game.channel.createEntity()) // Keep the visible cell populated.
            const pid = game.channel.createEntity()
            const component = game.transform(pid, false)
            game.step()
            game.clients.forEach(client => expect(client.network.store.ecsEntities.has(pid)).toBe(false))

            game.channel.setSpatialComponent(pid, component)
            game.step()
            game.clients.forEach(client => {
                expect(client.network.store.ecsEntities.has(pid)).toBe(true)
                expect(client.network.store.get(component.nid)).toMatchObject({ pid, x: 5 })
            })
        })

        it('preserves write order across multiple removals, flushes and object reuse', () => {
            const game = setup(dimensions, shared)
            const pid = game.channel.createEntity()
            game.transform(pid)
            const first = game.channel.addComponent(pid, { nid: 0, ntype: 2, hp: 100, shield: 100 })
            const second = game.channel.addComponent(pid, { nid: 0, ntype: 2, hp: 100, shield: 100 })
            const survivor = game.channel.addComponent(pid, { nid: 0, ntype: 2, hp: 60, shield: 60 })
            const writer = game.channel.createComponentWriter(2, game.context.getSchema(2))
            game.step()
            const removedNids = [first.nid, second.nid]

            writer.groups.vitals(first, 10, 10)
            survivor.hp = 70
            writer.props.hp(survivor, 70)
            game.channel.removeComponent(first)
            game.channel.getVisibleEntities(game.users[0].id)

            writer.props.shield(second, 20)
            survivor.hp = 80
            writer.groups.vitals(survivor, 80, 60)
            game.channel.removeComponent(second)
            first.hp = 33
            first.shield = 44
            game.channel.addComponent(pid, first)
            game.channel.getVisibleEntities(game.users[1].id)
            survivor.shield = 90
            writer.props.shield(survivor, 90)
            game.step()

            game.clients.forEach(client => {
                removedNids.forEach(nid => expect(client.network.store.get(nid)).toBeUndefined())
                expect(client.network.store.get(first.nid)).toMatchObject({ hp: 33, shield: 44 })
                expect(client.network.store.get(survivor.nid)).toMatchObject({ hp: 80, shield: 90 })
                expect(client.network.store.entities.size).toBe(3)
            })
            game.step()
            game.clients.forEach(client => {
                expect(client.network.store.get(first.nid)).toMatchObject({ hp: 33, shield: 44 })
                expect(client.network.store.get(survivor.nid)).toMatchObject({ hp: 80, shield: 90 })
            })
        })

        it.each([{ query: false, group: false }, { query: false, group: true },
            { query: true, group: false }, { query: true, group: true }])(
            'removes older components after writes and preserves survivors (query=$query group=$group)', ({ query, group }) => {
            const game = setup(dimensions, shared)
            const pid = game.channel.createEntity()
            const spatial = game.transform(pid)
            const otherPid = game.channel.createEntity()
            game.transform(otherPid)
            const survivor = game.channel.addComponent(otherPid, { nid: 0, ntype: 2, hp: 60, shield: 60 })
            const writer = game.channel.createComponentWriter(2, game.context.getSchema(2))
            const body = game.channel.addComponent(pid, { nid: 0, ntype: 2, hp: 100, shield: 100 })
            // Fast spatial ECS objects survive their first snapshot. Removal
            // after writes is supported in subsequent ticks.
            game.step()
            survivor.hp = 70
            writer.groups.vitals(survivor, 70, 60)
            const removedNid = body.nid
            body.hp = 90
            if (group) writer.groups.vitals(body, 90, 100)
            else writer.props.hp(body, 90)
            if (query) game.channel.getVisibleEntities(game.users[0].id)
            game.channel.removeComponent(body)
            survivor.shield = 80
            writer.props.shield(survivor, 80)
            const frames = game.step()
            game.clients.forEach((client, i) => {
                expect(client.network.store.get(removedNid)).toBeUndefined()
                expect(client.network.store.get(spatial.nid)).toMatchObject({ x: 5 })
                const frame = frames[i].getChannel(game.channel.nid)
                expect(client.network.store.get(survivor.nid)).toMatchObject({ hp: 70, shield: 80 })
                expect((frame?.updateEntities ?? []).every(update => update.nid === survivor.nid)).toBe(true)
                expect(frame?.ecsCreateComponents ?? []).toEqual([])
            })
        })
    }
)
