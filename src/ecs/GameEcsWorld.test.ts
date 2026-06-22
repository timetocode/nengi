import { GameEcsWorld, componentType, localComponentType, type Component } from './GameEcsWorld'

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
})
