import { EcsWorld, ecs, type Component } from './EcsWorld'
import { applyEcsChannelClose, applyEcsChannelFrame } from './applyEcsChannelFrame'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import type { ChannelFrame, ClosedChannel } from '../client/Frame'

type Position = Component & {
    ntype: 1
    x: number
    y: number
}

type Velocity = Component & {
    ntype: 2
    x: number
    y: number
}

type LocalMarker = Component & {
    ntype: -1
    label: string
}

const Position = ecs.defineComponent<Position>(1, 'Position')
const Velocity = ecs.defineComponent<Velocity>(2, 'Velocity')
const LocalMarker = ecs.defineLocalComponent<LocalMarker>('LocalMarker')

function createChannelFrame(partial: Partial<ChannelFrame>): ChannelFrame {
    return {
        channelId: 1,
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: [],
        deletedEntities: [],
        messages: [],
        interpolatedMessages: [],
        ...partial
    }
}

function createClosedChannel(partial: Partial<ClosedChannel>): ClosedChannel {
    return {
        channelId: 1,
        header: createChannelHeader(1, ChannelType.EcsChannel),
        entityNids: [],
        ...partial
    }
}

describe('EcsWorld', () => {
    it('uses one local id pool for entity ids and component nids', () => {
        const world = new EcsWorld()
        const pid = world.createEntity()
        const marker = world.add(LocalMarker.create({ pid, label: 'local' }))

        expect(pid).toBe(-1)
        expect(marker.nid).toBe(-2)
        expect(world.getByNid(marker.nid!)).toBe(marker)
        expect(world.componentOwner(marker.nid!)).toBe(pid)
        expect(world.componentNtype(marker.nid!)).toBe(LocalMarker.ntype)
        expect(world.componentNidsForEntity(pid)).toEqual([marker.nid])
    })

    it('skips explicit ids when generating local entity and component ids', () => {
        const world = new EcsWorld()
        world.createEntity(-1)

        const pid = world.createEntity()
        const marker = world.add(LocalMarker.create({ pid, label: 'local' }))

        expect(pid).toBe(-2)
        expect(marker.nid).toBe(-3)
    })

    it('queries entities by component composition', () => {
        const world = new EcsWorld()
        const moving = world.createEntity()
        const staticEntity = world.createEntity()
        world.add(Position.create({ pid: moving, nid: 10, x: 1, y: 2 }))
        world.add(Velocity.create({ pid: moving, nid: 11, x: 3, y: 4 }))
        world.add(Position.create({ pid: staticEntity, nid: 12, x: 8, y: 9 }))

        const seen: Array<[number, number, number]> = []
        world.query(Position, Velocity).all((pid, position, velocity) => {
            seen.push([pid, position.x, velocity.x])
        })

        expect(seen).toEqual([[moving, 1, 3]])
    })

    it('accepts class component instances when they expose ECS fields directly', () => {
        class ArmorComponent implements Component {
            readonly ntype = 3
            nid?: number

            constructor(public pid: number, public value: number) {}
        }

        const Armor = ecs.defineComponent<ArmorComponent>(3, 'Armor')
        const world = new EcsWorld()
        const entity = world.createEntity()
        const armor = world.add(new ArmorComponent(entity, 25))

        expect(world.require(entity, Armor)).toBe(armor)
        expect(world.getByNid(armor.nid!)).toBe(armor)
    })

    it('stores resources by token or class key', () => {
        class RendererResource {
            constructor(public name: string) {}
        }

        const Clock = ecs.defineResource<{ tick: number }>('Clock')
        const world = new EcsWorld()
        const clock = world.resource(Clock, () => ({ tick: 1 }))
        const renderer = world.setResource(RendererResource, new RendererResource('main'))

        expect(world.resource(Clock)).toBe(clock)
        expect(world.resource(Clock).tick).toBe(1)
        expect(world.resource(RendererResource)).toBe(renderer)
        expect(() => world.resource(ecs.defineResource('Missing'))).toThrow('Missing ECS resource: Missing')
    })

    it('throws when adding the same component type to an entity twice', () => {
        const world = new EcsWorld()
        const pid = world.createEntity()
        const original = world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))

        expect(() => world.add(Position.create({ pid, nid: 11, x: 3, y: 4 }))).toThrow(
            'Entity -1 already has component 1'
        )
        expect(world.get(pid, Position)).toBe(original)
        expect(world.getByNid(10)).toBe(original)
        expect(world.getByNid(11)).toBeUndefined()
    })

    it('rejects duplicate component nids without corrupting indexes', () => {
        const world = new EcsWorld()
        const firstPid = world.createEntity()
        const secondPid = world.createEntity()
        const original = world.add(Position.create({ pid: firstPid, nid: 10, x: 1, y: 2 }))

        expect(() => world.add(Velocity.create({ pid: secondPid, nid: 10, x: 3, y: 4 }))).toThrow(
            'ECS id 10 is already used by a component.'
        )
        expect(world.getByNid(10)).toBe(original)
        expect(world.has(secondPid, Velocity)).toBe(false)
        expect(world.componentCount(Velocity)).toBe(0)
    })

    it('keeps ECS entity ids and component nids in one id space', () => {
        const world = new EcsWorld()
        const pid = world.createEntity()
        const position = world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))

        expect(() => world.createEntity(10)).toThrow('ECS id 10 is already used by a component.')
        expect(() => world.add(Velocity.create({ pid: 20, nid: 20, x: 3, y: 4 }))).toThrow(
            'ECS id 20 is already used by an entity.'
        )
        expect(world.getByNid(10)).toBe(position)
        expect(world.entityCount()).toBe(1)
        expect(world.has(20, Velocity)).toBe(false)
    })

    it('lazily refreshes cached query membership on read', () => {
        const world = new EcsWorld()
        const pid = world.createEntity()
        world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        const moving = world.cachedQuery(Position, Velocity)

        expect(moving.pids()).toEqual([])

        world.add(Velocity.create({ pid, nid: 11, x: 3, y: 4 }))
        expect(world.query(Position, Velocity).pids()).toEqual([pid])
        expect(moving.pids()).toEqual([pid])

        world.removeComponent(pid, Velocity)
        expect(world.query(Position, Velocity).pids()).toEqual([])
        expect(moving.pids()).toEqual([])

        const seen: number[] = []
        moving.all((matchedPid) => {
            seen.push(matchedPid)
        })
        expect(seen).toEqual([])
    })

    it('applies ECS channel frame creates and updates to the world', () => {
        const world = new EcsWorld()
        const frame = createChannelFrame({
            channelId: 7,
            ecsCreateEntities: [100],
            ecsCreateComponents: [
                { pid: 100, nid: 10, ntype: Position.ntype, x: 1, y: 2 }
            ],
            updateEntities: [
                { nid: 10, prop: 'x', previous: 1, value: 5 }
            ]
        })

        const changes = applyEcsChannelFrame(world, frame)

        expect(changes.channelId).toBe(7)
        expect(changes.createdEntities).toEqual([100])
        expect(changes.createdComponents.map(component => component.nid)).toEqual([10])
        expect(changes.updatedComponents).toEqual([
            {
                component: world.getByNid(10),
                nid: 10,
                prop: 'x',
                previous: 1,
                value: 5
            }
        ])
        expect(world.require(100, Position).x).toBe(5)
    })

    it('applies ECS component deletes before root deletes', () => {
        const world = new EcsWorld()
        const pid = world.createEntity(100)
        world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        world.add(Velocity.create({ pid, nid: 11, x: 3, y: 4 }))

        const changes = applyEcsChannelFrame(world, createChannelFrame({
            deleteEntities: [10],
            ecsDeleteEntities: [100]
        }))

        expect(changes.deletedComponents.map(component => component.nid)).toEqual([10, 11])
        expect(changes.deletedEntities).toEqual([100])
        expect(world.entityCount()).toBe(0)
        expect(world.getByNid(10)).toBeUndefined()
        expect(world.getByNid(11)).toBeUndefined()
    })

    it('preserves local components when an ECS root is deleted', () => {
        const world = new EcsWorld()
        const pid = world.createEntity(100)
        world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        const local = world.add(LocalMarker.create({ pid, label: 'render' }))

        const changes = applyEcsChannelFrame(world, createChannelFrame({
            ecsDeleteEntities: [100]
        }))

        expect(changes.deletedComponents.map(component => component.nid)).toEqual([10])
        expect(changes.deletedEntities).toEqual([100])
        expect(world.getByNid(10)).toBeUndefined()
        expect(world.getByNid(local.nid!)).toBe(local)
        expect(world.entityCount()).toBe(1)
    })

    it('applies ECS channel close when the close list includes root and component ids', () => {
        const world = new EcsWorld()
        const pid = world.createEntity(100)
        world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        world.add(Velocity.create({ pid, nid: 11, x: 3, y: 4 }))

        const changes = applyEcsChannelClose(world, createClosedChannel({
            entityNids: [100, 10, 11]
        }))

        expect(changes.deletedComponents.map(component => component.nid)).toEqual([10, 11])
        expect(changes.deletedEntities).toEqual([100])
        expect(world.entityCount()).toBe(0)
        expect(world.getByNid(10)).toBeUndefined()
        expect(world.getByNid(11)).toBeUndefined()
    })

    it('applies ECS channel close to network components while preserving local components', () => {
        const world = new EcsWorld()
        const pid = world.createEntity(100)
        world.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        world.add(Velocity.create({ pid, nid: 11, x: 3, y: 4 }))
        const local = world.add(LocalMarker.create({ pid, label: 'render' }))

        const changes = applyEcsChannelClose(world, createClosedChannel({
            channelId: 7,
            entityNids: [10, 11]
        }))

        expect(changes.channelId).toBe(7)
        expect(changes.deletedComponents.map(component => component.nid)).toEqual([10, 11])
        expect(changes.deletedEntities).toEqual([100])
        expect(world.getByNid(10)).toBeUndefined()
        expect(world.getByNid(11)).toBeUndefined()
        expect(world.getByNid(local.nid!)).toBe(local)
        expect(world.entityCount()).toBe(1)
    })
})
