import { GameEcsWorld, componentType, localComponentType, type Component } from './GameEcsWorld'
import { applyEcsChannelFrameToWorld } from './applyEcsChannelFrameToWorld'
import type { ChannelFrame } from '../client/Frame'

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

const Position = componentType<Position>(1, 'Position')
const Velocity = componentType<Velocity>(2, 'Velocity')
const LocalMarker = localComponentType<LocalMarker>('LocalMarker')

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

describe('GameEcsWorld', () => {
    it('uses one local id pool for entity ids and component nids', () => {
        const ecs = new GameEcsWorld()
        const pid = ecs.createEntity()
        const marker = ecs.add(LocalMarker.create({ pid, label: 'local' }))

        expect(pid).toBe(-1)
        expect(marker.nid).toBe(-2)
        expect(ecs.getByNid(marker.nid!)).toBe(marker)
        expect(ecs.componentOwner(marker.nid!)).toBe(pid)
        expect(ecs.componentNtype(marker.nid!)).toBe(LocalMarker.ntype)
        expect(ecs.componentNidsForEntity(pid)).toEqual([marker.nid])
    })

    it('queries entities by component composition', () => {
        const ecs = new GameEcsWorld()
        const moving = ecs.createEntity()
        const staticEntity = ecs.createEntity()
        ecs.add(Position.create({ pid: moving, nid: 10, x: 1, y: 2 }))
        ecs.add(Velocity.create({ pid: moving, nid: 11, x: 3, y: 4 }))
        ecs.add(Position.create({ pid: staticEntity, nid: 12, x: 8, y: 9 }))

        const seen: Array<[number, number, number]> = []
        ecs.query(Position, Velocity).all((pid, position, velocity) => {
            seen.push([pid, position.x, velocity.x])
        })

        expect(seen).toEqual([[moving, 1, 3]])
    })

    it('throws when adding the same component type to an entity twice', () => {
        const ecs = new GameEcsWorld()
        const pid = ecs.createEntity()
        const original = ecs.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))

        expect(() => ecs.add(Position.create({ pid, nid: 11, x: 3, y: 4 }))).toThrow(
            'Entity -1 already has component 1'
        )
        expect(ecs.get(pid, Position)).toBe(original)
        expect(ecs.getByNid(10)).toBe(original)
        expect(ecs.getByNid(11)).toBeUndefined()
    })

    it('applies ECS channel frame creates and updates to the world', () => {
        const ecs = new GameEcsWorld()
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

        const changes = applyEcsChannelFrameToWorld(ecs, frame)

        expect(changes.channelId).toBe(7)
        expect(changes.createdEntities).toEqual([100])
        expect(changes.createdComponents.map(component => component.nid)).toEqual([10])
        expect(changes.updatedComponents).toEqual([
            {
                component: ecs.getByNid(10),
                nid: 10,
                prop: 'x',
                previous: 1,
                value: 5
            }
        ])
        expect(ecs.require(100, Position).x).toBe(5)
    })

    it('applies ECS component deletes before root deletes', () => {
        const ecs = new GameEcsWorld()
        const pid = ecs.createEntity(100)
        ecs.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        ecs.add(Velocity.create({ pid, nid: 11, x: 3, y: 4 }))

        const changes = applyEcsChannelFrameToWorld(ecs, createChannelFrame({
            deleteEntities: [10],
            ecsDeleteEntities: [100]
        }))

        expect(changes.deletedComponents.map(component => component.nid)).toEqual([10, 11])
        expect(changes.deletedEntities).toEqual([100])
        expect(ecs.entityCount()).toBe(0)
        expect(ecs.getByNid(10)).toBeUndefined()
        expect(ecs.getByNid(11)).toBeUndefined()
    })

    it('preserves local components when an ECS root is deleted', () => {
        const ecs = new GameEcsWorld()
        const pid = ecs.createEntity(100)
        ecs.add(Position.create({ pid, nid: 10, x: 1, y: 2 }))
        const local = ecs.add(LocalMarker.create({ pid, label: 'render' }))

        const changes = applyEcsChannelFrameToWorld(ecs, createChannelFrame({
            ecsDeleteEntities: [100]
        }))

        expect(changes.deletedComponents.map(component => component.nid)).toEqual([10])
        expect(changes.deletedEntities).toEqual([100])
        expect(ecs.getByNid(10)).toBeUndefined()
        expect(ecs.getByNid(local.nid!)).toBe(local)
        expect(ecs.entityCount()).toBe(1)
    })
})
