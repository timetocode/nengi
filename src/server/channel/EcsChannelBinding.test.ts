import { Binary } from '../../common/binary/Binary'
import { Context } from '../../common/Context'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Component, EcsWorld, ecs } from '../../ecs/EcsWorld'
import { LocalState } from '../LocalState'
import { Instance } from '../Instance'
import { EcsChannel } from './EcsChannel'
import { EcsChannel2D } from './EcsChannel2D'
import { EcsChannel3D } from './EcsChannel3D'
import { bindEcsChannel } from './EcsChannelBinding'

type TransformComponent = Component & {
    ntype: 1
    x: number
    y: number
    z: number
    rotation: number
    radius: number
}

type ActorComponent = Component & {
    ntype: 2
    kind: number
    hp: number
    team: number
}

type LocalMarkerComponent = Component & {
    ntype: number
    label: string
}

const Transform = ecs.defineComponent<TransformComponent>(1, 'Transform')
const Actor = ecs.defineComponent<ActorComponent>(2, 'Actor')
const LocalMarker = ecs.defineLocalComponent<LocalMarkerComponent>('LocalMarker')

function createContext() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        rotation: Binary.Float64,
        radius: Binary.Float64,
        $options: {
            updateGroups: {
                pose: ['x', 'y', 'rotation']
            }
        }
    }))
    context.register(2, defineEntitySchema({
        kind: Binary.UInt8,
        hp: Binary.UInt16,
        team: Binary.UInt8
    }))
    return context
}

function transformState() {
    return { x: 0, y: 0, z: 0, rotation: 0, radius: 10 }
}

function actorState() {
    return { kind: 1, hp: 100, team: 2 }
}

describe('ECS channel binding', () => {
    it('keeps world roots, network roots, and local components separate', () => {
        const context = createContext()
        const world = new EcsWorld()
        const channel = new EcsChannel(new LocalState())
        const replicated = bindEcsChannel(world, channel, { context })
        const TransformNet = replicated.component(Transform)

        const pid = replicated.createEntity()
        const local = world.add(LocalMarker.create({ pid, label: 'server-only' }))
        const transform = TransformNet.add(pid, transformState())

        expect(world.hasEntity(pid)).toBe(true)
        expect(channel.hasRoot(pid)).toBe(true)
        expect(world.get(pid, Transform)).toBe(transform)
        expect(transform.pid).toBe(pid)
        expect(transform.nid).toBeGreaterThan(0)
        expect(local.label).toBe('server-only')

        replicated.removeEntity(pid)

        expect(world.hasEntity(pid)).toBe(false)
        expect(channel.hasRoot(pid)).toBe(false)
        expect(world.get(pid, Transform)).toBeUndefined()
        expect(world.get(pid, LocalMarker)).toBeUndefined()
    })

    it('constructs network components without caller-owned metadata', () => {
        const context = createContext()
        const world = new EcsWorld()
        const channel = new EcsChannel(new LocalState())
        const replicated = bindEcsChannel(world, channel, { context })
        const TransformNet = replicated.component(Transform)
        const ActorNet = replicated.component(Actor)
        const pid = replicated.createEntity()

        const transform = TransformNet.add(pid, transformState())
        const actor = ActorNet.add(pid, actorState())

        expect(transform.ntype).toBe(Transform.ntype)
        expect(actor.ntype).toBe(Actor.ntype)
        expect(transform.pid).toBe(pid)
        expect(actor.pid).toBe(pid)
        expect(transform.nid).toBeGreaterThan(0)
        expect(actor.nid).toBeGreaterThan(0)
        expect(world.get(pid, Transform)).toBe(transform)
        expect(world.get(pid, Actor)).toBe(actor)
    })

    it('separates append-only writers from assigning mutators', () => {
        const context = createContext()
        const world = new EcsWorld()
        const channel = new EcsChannel(new LocalState())
        const replicated = bindEcsChannel(world, channel, { context })
        const TransformNet = replicated.component(Transform)
        const transform = TransformNet.add(replicated.createEntity(), transformState())

        TransformNet.writer.props.x(transform, 10)
        expect(transform.x).toBe(0)
        expect(channel.manualPropValues).toEqual([10])

        TransformNet.mutate.patch(transform, { x: 20, y: 30 })
        expect(transform.x).toBe(20)
        expect(transform.y).toBe(30)
        expect(channel.manualPropValues).toEqual([10, 20, 30])

        TransformNet.mutate.groups.pose(transform, 40, 50, 1.5)
        expect(transform.x).toBe(40)
        expect(transform.y).toBe(50)
        expect(transform.rotation).toBe(1.5)
        expect(channel.manualGroupValues).toEqual([40, 50, 1.5])
    })

    it('does not partially apply invalid mutator plans', () => {
        const context = createContext()
        const world = new EcsWorld()
        const channel = new EcsChannel(new LocalState())
        const replicated = bindEcsChannel(world, channel, { context })
        const TransformNet = replicated.component(Transform)
        const transform = TransformNet.add(replicated.createEntity(), transformState())

        expect(() => TransformNet.mutate.patch(transform, { unknown: 1 } as any)).toThrow(
            'Property unknown is not in ECS component schema 1.'
        )
        expect(transform.x).toBe(0)
        expect(channel.manualPropValues).toEqual([])

        expect(() => TransformNet.mutate.groups.pose(transform, 1, 2)).toThrow(
            'ECS update group pose expects 3 values, received 2.'
        )
        expect(transform.x).toBe(0)
        expect(channel.manualGroupValues).toEqual([])
    })

    it('rejects local component definitions without affecting local components in the world', () => {
        const context = createContext()
        const world = new EcsWorld()
        const channel = new EcsChannel(new LocalState())
        const replicated = bindEcsChannel(world, channel, { context })

        expect(() => replicated.component(LocalMarker)).toThrow(
            'ECS component type -1 is local-only and cannot be bound to a network channel.'
        )

        const pid = replicated.createEntity()
        const local = world.add(LocalMarker.create({ pid, label: 'local' }))
        expect(world.get(pid, LocalMarker)).toBe(local)
    })

    it('detects a root removed through the raw channel', () => {
        const context = createContext()
        const world = new EcsWorld()
        const channel = new EcsChannel(new LocalState())
        const replicated = bindEcsChannel(world, channel, { context })
        const pid = replicated.createEntity()

        channel.removeEntity(pid)

        expect(channel.hasRoot(pid)).toBe(false)
        expect(() => replicated.removeEntity(pid)).toThrow(
            `ECS channel binding invariant failed for root ${pid}: owned=true, world=true, channel=false.`
        )
    })

    describe.each([EcsChannel2D, EcsChannel3D])('%p unpositioned roots', Channel => {
        it.each([false, true])('removes components without a spatial component (previously spatial=%s)', previouslySpatial => {
            const context = createContext()
            const instance = new Instance(context)
            const world = new EcsWorld()
            const channel = new Channel(instance.localState, 100)
            const binding = bindEcsChannel(world, channel, { context })
            const TransformNet = binding.component(Transform)
            const ActorNet = binding.component(Actor)
            const pid = binding.createEntity()
            const actor = ActorNet.add(pid, actorState())
            const actorNid = actor.nid
            const transform = previouslySpatial ? TransformNet.addSpatial(pid, transformState()) : undefined
            instance.step() // Created components survive their first snapshot boundary.
            if (transform) TransformNet.remove(transform)

            expect(channel.hasSpatialComponent(pid)).toBe(false)
            expect(() => ActorNet.mutate.props.hp(actor, 50)).toThrow('has no spatial component')
            expect(actor.hp).toBe(100)
            expect(() => ActorNet.remove({ ...actor })).toThrow('not owned by this channel binding')
            expect(() => ActorNet.remove(actor)).not.toThrow()
            expect(world.get(pid, Actor)).toBeUndefined()
            expect(world.getByNid(actorNid)).toBeUndefined()
            expect(channel.getComponent(actorNid)).toBeUndefined()
            expect(world.hasEntity(pid)).toBe(true)
            expect(channel.hasRoot(pid)).toBe(true)
            binding.removeEntity(pid)
            expect(world.hasEntity(pid)).toBe(false)
            expect(channel.hasRoot(pid)).toBe(false)
        })
    })

    it('exposes spatial construction only for spatial channels', () => {
        const context = createContext()

        const world2D = new EcsWorld()
        const channel2D = new EcsChannel2D(new LocalState(), 100)
        const replicated2D = bindEcsChannel(world2D, channel2D, { context })
        const Transform2DNet = replicated2D.component(Transform)
        const transform2D = Transform2DNet.addSpatial(replicated2D.createEntity(), transformState())
        expect(channel2D.hasSpatialComponent(transform2D.pid)).toBe(true)
        Transform2DNet.mutate.patch(transform2D, { x: 5 })
        expect(transform2D.x).toBe(5)

        const world3D = new EcsWorld()
        const channel3D = new EcsChannel3D(new LocalState(), 100)
        const replicated3D = bindEcsChannel(world3D, channel3D, { context })
        const Transform3DNet = replicated3D.component(Transform)
        const transform3D = Transform3DNet.addSpatial(replicated3D.createEntity(), transformState())
        expect(channel3D.hasSpatialComponent(transform3D.pid)).toBe(true)

        const plainWorld = new EcsWorld()
        const plainChannel = new EcsChannel(new LocalState())
        const plain = bindEcsChannel(plainWorld, plainChannel, { context }).component(Transform)
        expect((plain as any).addSpatial).toBeUndefined()
    })
})
