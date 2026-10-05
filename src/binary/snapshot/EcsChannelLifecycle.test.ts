import { Binary, Client, Context, EcsChannel, EcsWorld, Instance, applyEcsChannelFrame, bindEcsChannel, defineEntitySchema, ecs } from '../../index'
import { User } from '../../server/User'
import { TestClientTransport } from '../../testSupport/ClientTransport'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'

type Position = { nid: number, pid: number, ntype: number, x: number, y: number }
const Position = ecs.defineComponent<Position>(1, 'Position')

function setup(shared: boolean) {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        $options: { updateGroups: { position: ['x', 'y'] } }
    }))
    const instance = new Instance(context)
    instance.network.sharedUpdateFragmentsEnabled = shared
    const channel = new EcsChannel(instance.localState)
    const binding = bindEcsChannel(new EcsWorld(), channel, { context })
    const positions = binding.component(Position)
    const clients: { user: User, client: Client, world: EcsWorld, send: jest.Mock }[] = []
    const subscribe = () => {
        const send = jest.fn()
        const user = new User(undefined, { binary: testBinaryAdapter, send, disconnect: jest.fn() } as any)
        user.id = clients.length + 1
        user.instance = instance
        instance.connectedUsers.set(user.id, user)
        channel.subscribe(user)
        const consumer = { user, client: new Client(context, TestClientTransport, 20), world: new EcsWorld(), send }
        clients.push(consumer)
        return consumer
    }
    const step = () => {
        instance.step()
        for (const { client, world, send } of clients) {
            const packet = send.mock.calls[send.mock.calls.length - 1][1]
            client.network.readSnapshot(testBinaryAdapter.createReader(packet))
            const frame = client.network.processNextFrame()!
            frame.channels.forEach(channel => applyEcsChannelFrame(world, channel))
        }
    }
    subscribe()
    subscribe()
    return { channel, binding, positions, clients, step, subscribe }
}

describe.each([false, true])('plain ECS lifecycle with shared fragments=%s', shared => {
    it.each([
        ['root', 'prop'], ['root', 'group'], ['component', 'prop'], ['component', 'group']
    ])('discards cancelled %s %s writes while preserving interleaved live updates', (kind, emit) => {
        const game = setup(shared)
        const keep = game.binding.createEntity()
        const live = game.positions.add(keep, { x: 1, y: 2 })
        const oldEmptyRoot = game.binding.createEntity()
        game.step()

        const pid = kind === 'root' ? game.binding.createEntity() : oldEmptyRoot
        const cancelled = game.positions.add(pid, { x: 3, y: 4 })
        const cancelledNid = cancelled.nid
        game.positions.mutate.props.x(live, 10)
        if (emit === 'group') game.positions.mutate.groups.position(cancelled, 5, 6)
        else game.positions.mutate.props.x(cancelled, 5)
        game.positions.mutate.groups.position(live, 20, 30)
        if (kind === 'root') game.binding.removeEntity(pid)
        else game.positions.remove(cancelled)
        game.positions.mutate.props.x(live, 40)

        game.step()
        game.step()
        for (const { client, world } of game.clients) {
            expect(world.require(keep, Position)).toMatchObject({ x: 40, y: 30 })
            expect(world.getByNid(cancelledNid)).toBeUndefined()
            expect(client.network.store.get(cancelledNid)).toBeUndefined()
            expect(world.hasEntity(pid)).toBe(kind !== 'root')
        }
    })

    it.each(['prop', 'group'])('does not send a removed old component to an empty new subscriber: %s', emit => {
        const game = setup(shared)
        const pid = game.binding.createEntity()
        const removed = game.positions.add(pid, { x: 1, y: 2 })
        game.step()
        if (emit === 'group') game.positions.mutate.groups.position(removed, 3, 4)
        else game.positions.mutate.props.x(removed, 3)
        game.binding.removeEntity(pid)
        const newcomer = game.subscribe()

        game.step()
        for (const { world } of game.clients) expect(world.hasEntity(pid)).toBe(false)
        expect(newcomer.client.network.store.entities.size).toBe(0)
    })

    it('keeps writes to a replacement component with a new identity', () => {
        const game = setup(shared)
        const pid = game.binding.createEntity()
        const original = game.positions.add(pid, { x: 1, y: 2 })
        game.step()
        const oldNid = original.nid
        game.positions.mutate.groups.position(original, 10, 20)
        game.positions.remove(original)
        const replacement = game.positions.add(pid, { x: original.x, y: original.y })
        game.positions.mutate.patch(replacement, { x: 30, y: 40 })
        expect(replacement.nid).not.toBe(oldNid)

        game.step()
        game.clients.forEach(({ world }) => {
            expect(world.getByNid(oldNid)).toBeUndefined()
            expect(world.require(pid, Position)).toMatchObject({ nid: replacement.nid, x: 30, y: 40 })
        })
    })
})
