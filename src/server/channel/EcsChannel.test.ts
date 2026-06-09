import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { EcsChannel } from './EcsChannel'
import { EcsSpatialChannel2D } from './EcsSpatialChannel2D'
import { EcsSpatialChannel3D } from './EcsSpatialChannel3D'
import { ManualSpatialChannel2D } from './ManualSpatialChannel2D'

enum NType {
    Component = 1
}

function createUser(localState: LocalState) {
    // @ts-ignore these tests do not send through a real adapter
    const user = new User(undefined, undefined)
    user.id = 1
    user.instance = { localState } as any
    return user
}

function createCollidingSchema() {
    return defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        $options: {
            updateGroups: {
                x: ['x', 'y']
            }
        }
    })
}

describe('ECS channels', () => {
    it('removes ambiguous direct aliases while keeping explicit prop and group writers', () => {
        const schema = createCollidingSchema()
        const localState = new LocalState()
        const ecs = new EcsChannel(localState)
        const ecsSpatial2D = new EcsSpatialChannel2D(localState, 100)
        const ecsSpatial3D = new EcsSpatialChannel3D(localState, 100)

        for (const channel of [ecs, ecsSpatial2D, ecsSpatial3D]) {
            const writer = channel.createComponentWriter(NType.Component, schema)

            expect(writer.x).toBeUndefined()
            expect(typeof writer.props.x).toBe('function')
            expect(typeof writer.groups.x).toBe('function')
        }
    })

    it('destroys an EcsChannel subscription, roots, components, and local registration', () => {
        const localState = new LocalState()
        const channel = new EcsChannel(localState)
        const user = createUser(localState)

        channel.subscribe(user)
        const pid = channel.createEntity()
        const component = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Component,
            x: 1
        })
        const componentNid = component.nid

        expect(localState.channels.has(channel)).toBe(true)
        expect(user.subscriptions.has(channel.nid)).toBe(true)
        expect(localState.getByNid(componentNid)).toBe(component)

        channel.destroy()

        expect(localState.channels.has(channel)).toBe(false)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(channel.rootNids).toEqual([])
        expect(channel.componentNids).toEqual([])
        expect(localState.getByNid(componentNid)).toBeUndefined()
        expect(component.nid).toBe(0)
    })

    it('destroys an EcsSpatialChannel2D subscription, roots, components, and local registration', () => {
        const localState = new LocalState()
        const channel = new EcsSpatialChannel2D(localState, 100)
        const user = createUser(localState)

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 100, halfHeight: 100 })
        const pid = channel.createEntity()
        const component = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Component,
            x: 1,
            y: 1
        })
        const componentNid = component.nid

        expect(localState.channels.has(channel as any)).toBe(true)
        expect(user.subscriptions.has(channel.nid)).toBe(true)
        expect(localState.getByNid(componentNid)).toBe(component)

        channel.destroy()

        expect(localState.channels.has(channel as any)).toBe(false)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(channel.rootNids).toEqual([])
        expect(channel.componentNids).toEqual([])
        expect(localState.getByNid(componentNid)).toBeUndefined()
        expect(component.nid).toBe(0)
    })

    it('destroys an EcsSpatialChannel3D subscription, roots, components, and local registration', () => {
        const localState = new LocalState()
        const channel = new EcsSpatialChannel3D(localState, 100)
        const user = createUser(localState)

        channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 100, halfHeight: 100, halfDepth: 100 })
        const pid = channel.createEntity()
        const component = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Component,
            x: 1,
            y: 1,
            z: 1
        })
        const componentNid = component.nid

        expect(localState.channels.has(channel as any)).toBe(true)
        expect(user.subscriptions.has(channel.nid)).toBe(true)
        expect(localState.getByNid(componentNid)).toBe(component)

        channel.destroy()

        expect(localState.channels.has(channel as any)).toBe(false)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(channel.rootNids).toEqual([])
        expect(channel.componentNids).toEqual([])
        expect(localState.getByNid(componentNid)).toBeUndefined()
        expect(component.nid).toBe(0)
    })

    it('can throw when a manual spatial write cannot be associated with a cell', () => {
        const schema = createCollidingSchema()
        const localState = new LocalState()
        const channel = new ManualSpatialChannel2D(localState, 100, { debugManualWrites: true })
        const writer = channel.createEntityWriter(NType.Component, schema)

        expect(() => writer.props.x({ nid: 999, ntype: NType.Component, x: 1, y: 1 }, 2))
            .toThrow('ManualSpatialChannel2D cannot write mutation')
    })

    it('can throw when an ECS spatial write cannot be associated with a cell', () => {
        const schema = createCollidingSchema()
        const localState = new LocalState()
        const channel = new EcsSpatialChannel2D(localState, 100, { debugManualWrites: true })
        const writer = channel.createComponentWriter(NType.Component, schema)
        const pid = channel.createEntity()
        const component = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Component,
            x: 1,
            y: 1
        })

        expect(() => writer.props.x(component, 2))
            .toThrow('EcsSpatialChannel2D cannot write mutation')
    })

    it('can throw when an ECS spatial 3D write cannot be associated with a cell', () => {
        const schema = createCollidingSchema()
        const localState = new LocalState()
        const channel = new EcsSpatialChannel3D(localState, 100, { debugManualWrites: true })
        const writer = channel.createComponentWriter(NType.Component, schema)
        const pid = channel.createEntity()
        const component = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Component,
            x: 1,
            y: 1,
            z: 1
        })

        expect(() => writer.props.x(component, 2))
            .toThrow('EcsSpatialChannel3D cannot write mutation')
    })
})
