import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { ManualChannel } from './ManualChannel'
import { ManualSpatialChannel2D } from './ManualSpatialChannel2D'
import { ManualSpatialChannel3D } from './ManualSpatialChannel3D'
import { SpatialChannel2D } from './SpatialChannel2D'
import { SpatialChannel3D } from './SpatialChannel3D'

enum NType {
    Entity = 1
}

type TestEntity = {
    nid: number
    ntype: number
    x: number
    y: number
    z: number
    label?: string
}

function createUser(localState: LocalState) {
    // @ts-ignore these tests do not send through a real adapter
    const user = new User(undefined, undefined)
    user.id = 1
    user.instance = { localState } as any
    return user
}

function createEntity(x: number, y: number, z = 0): TestEntity {
    return { nid: 0, ntype: NType.Entity, x, y, z, label: 'entity' }
}

function createGroupedSchema() {
    return defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        label: Binary.String,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    })
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

describe('manual and spatial channels', () => {
    it('writes and clears manual prop and group logs', () => {
        const localState = new LocalState()
        const channel = new ManualChannel(localState)
        const schema = createGroupedSchema()
        const writer = channel.createEntityWriter(NType.Entity, schema)
        const entity = channel.addEntity(createEntity(1, 2))

        writer.props.x(entity, 3)
        writer.groups.position(entity, 4, 5)

        expect(channel.manualPropNids).toEqual([entity.nid])
        expect(channel.manualPropValues).toEqual([3])
        expect(channel.manualGroupNids).toEqual([entity.nid])
        expect(channel.manualGroupValueOffsets).toEqual([0])
        expect(channel.manualGroupValues).toEqual([4, 5])

        channel.clearSnapshotDeltas()

        expect(channel.manualPropNids).toEqual([])
        expect(channel.manualGroupNids).toEqual([])
        expect(channel.manualGroupValues).toEqual([])
    })

    it('removes ambiguous ManualChannel direct aliases while keeping explicit writers', () => {
        const localState = new LocalState()
        const channel = new ManualChannel(localState)
        const writer = channel.createEntityWriter(NType.Entity, createCollidingSchema())

        expect(writer.x).toBeUndefined()
        expect(typeof writer.props.x).toBe('function')
        expect(typeof writer.groups.x).toBe('function')
    })

    it('records manual spatial 2D updates by visible cell and clears them after the snapshot boundary', () => {
        const localState = new LocalState()
        const channel = new ManualSpatialChannel2D(localState, 10)
        const user = createUser(localState)
        const writer = channel.createEntityWriter(NType.Entity, createGroupedSchema())
        const entity = channel.addEntity(createEntity(1, 2))

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })
        writer.groups.position(entity, 3, 4)

        const cellKey = channel.getVisibleCellKeys(user.id)[0]
        const log = channel.getManualCellUpdateLog(cellKey)!

        expect(log.manualGroupNids).toEqual([entity.nid])
        expect(log.manualGroupValues).toEqual([3, 4])

        channel.clearSnapshotDeltas()

        expect(channel.getManualCellUpdateLog(cellKey)).toBeNull()
    })

    it('records manual spatial 3D updates by visible cell', () => {
        const localState = new LocalState()
        const channel = new ManualSpatialChannel3D(localState, 10)
        const user = createUser(localState)
        const writer = channel.createEntityWriter(NType.Entity, createGroupedSchema())
        const entity = channel.addEntity(createEntity(1, 2, 3))

        channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })
        writer.props.x(entity, 5)

        const cellKey = channel.getVisibleCellKeys(user.id)[0]
        const log = channel.getManualCellUpdateLog(cellKey)!

        expect(log.manualPropNids).toEqual([entity.nid])
        expect(log.manualPropValues).toEqual([5])
    })

    it('uses SpatialChannel2D views and movement updates for direct visibility', () => {
        const localState = new LocalState()
        const channel = new SpatialChannel2D(localState, 10)
        const user = createUser(localState)
        const inside = channel.addEntity(createEntity(1, 1))
        const outside = channel.addEntity(createEntity(50, 50))

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })

        expect(channel.getVisibleEntities(user.id)).toEqual([inside.nid])

        outside.x = 2
        outside.y = 2
        channel.updateEntity(outside)

        expect(channel.getVisibleEntities(user.id).sort((a, b) => a - b)).toEqual([inside.nid, outside.nid].sort((a, b) => a - b))
    })

    it('ignores stale SpatialChannel2D remove objects without mutating grid membership', () => {
        const localState = new LocalState()
        const channel = new SpatialChannel2D(localState, 10)
        const user = createUser(localState)
        const entity = channel.addEntity(createEntity(1, 1))
        const nid = entity.nid

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })

        expect(channel.removeEntity({ ...entity })).toBe(0)
        expect(channel.entities.get(nid)).toBe(entity)
        expect(channel.getVisibleEntities(user.id)).toEqual([nid])
        expect(localState.sources.has(nid)).toBe(true)
        expect(entity.nid).toBe(nid)
    })

    it('ignores stale ManualSpatialChannel2D remove objects without mutating grid membership', () => {
        const localState = new LocalState()
        const channel = new ManualSpatialChannel2D(localState, 10)
        const user = createUser(localState)
        const entity = channel.addEntity(createEntity(1, 1))
        const nid = entity.nid

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })

        expect(channel.removeEntity({ ...entity })).toBe(0)
        expect(channel.entities.get(nid)).toBe(entity)
        expect(channel.getVisibleEntities(user.id)).toEqual([nid])
        expect(localState.sources.has(nid)).toBe(true)
        expect(entity.nid).toBe(nid)
    })

    it('clears automatic spatial inner channel deltas at the snapshot boundary', () => {
        const localState = new LocalState()
        const channel = new SpatialChannel2D(localState, 10)
        const entity = channel.addEntity(createEntity(1, 1))

        expect((channel as any).channel.createdRoots.length).toBe(1)
        channel.clearSnapshotDeltas()
        expect((channel as any).channel.createdRoots).toEqual([])

        channel.removeEntity(entity)
        expect((channel as any).channel.deletedNids.length).toBe(1)

        channel.clearSnapshotDeltas()

        expect((channel as any).channel.createdRoots).toEqual([])
        expect((channel as any).channel.deletedNids).toEqual([])
    })

    it('uses SpatialChannel3D views and vertical culling for direct visibility', () => {
        const localState = new LocalState()
        const channel = new SpatialChannel3D(localState, 10)
        const user = createUser(localState)
        const inside = channel.addEntity(createEntity(1, 1, 1))
        const above = channel.addEntity(createEntity(1, 50, 1))

        channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })

        expect(channel.getVisibleEntities(user.id)).toEqual([inside.nid])

        above.y = 2
        channel.updateEntity(above)

        expect(channel.getVisibleEntities(user.id).sort((a, b) => a - b)).toEqual([inside.nid, above.nid].sort((a, b) => a - b))
    })

    it('destroys spatial subscriptions, entities, and local registration', () => {
        const localState = new LocalState()
        const channel = new SpatialChannel2D(localState, 10)
        const user = createUser(localState)
        const entity = channel.addEntity(createEntity(1, 1))
        const nid = entity.nid

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })
        channel.getVisibleNetworkedNids(user.id)

        channel.destroy()

        expect(channel.entities.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(localState.channels.has(channel as any)).toBe(false)
        expect(localState.sources.has(nid)).toBe(false)
        expect(entity.nid).toBe(0)
    })

    it('destroys ManualChannel entities, subscriptions, and pending manual logs', () => {
        const localState = new LocalState()
        const channel = new ManualChannel(localState)
        const user = createUser(localState)
        const writer = channel.createEntityWriter(NType.Entity, createGroupedSchema())
        const entity = channel.addEntity(createEntity(1, 1))
        const nid = entity.nid

        channel.subscribe(user)
        writer.props.x(entity, 5)
        writer.groups.position(entity, 6, 7)

        channel.destroy()

        expect(channel.entities.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(localState.channels.has(channel)).toBe(false)
        expect(localState.sources.has(nid)).toBe(false)
        expect(entity.nid).toBe(0)
        expect(channel.manualPropNids).toEqual([])
        expect(channel.manualGroupNids).toEqual([])
        expect(channel.manualGroupValues).toEqual([])
    })

    it('destroys SpatialChannel3D subscriptions, entities, and local registration', () => {
        const localState = new LocalState()
        const channel = new SpatialChannel3D(localState, 10)
        const user = createUser(localState)
        const entity = channel.addEntity(createEntity(1, 1, 1))
        const nid = entity.nid

        channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })
        channel.getVisibleNetworkedNids(user.id)

        channel.destroy()

        expect(channel.entities.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(localState.channels.has(channel as any)).toBe(false)
        expect(localState.sources.has(nid)).toBe(false)
        expect(entity.nid).toBe(0)
    })

    it('destroys ManualSpatialChannel2D subscriptions, entities, local registration, and manual logs', () => {
        const localState = new LocalState()
        const channel = new ManualSpatialChannel2D(localState, 10)
        const user = createUser(localState)
        const writer = channel.createEntityWriter(NType.Entity, createGroupedSchema())
        const entity = channel.addEntity(createEntity(1, 1))
        const nid = entity.nid

        channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })
        writer.props.x(entity, 5)
        expect(channel.cellHasManualUpdates(channel.getVisibleCellKeys(user.id)[0])).toBe(true)

        channel.destroy()

        expect(channel.entities.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(localState.channels.has(channel as any)).toBe(false)
        expect(localState.sources.has(nid)).toBe(false)
        expect(entity.nid).toBe(0)
        expect(channel.dirtyCells.size).toBe(0)
    })

    it('destroys ManualSpatialChannel3D subscriptions, entities, local registration, and manual logs', () => {
        const localState = new LocalState()
        const channel = new ManualSpatialChannel3D(localState, 10)
        const user = createUser(localState)
        const writer = channel.createEntityWriter(NType.Entity, createGroupedSchema())
        const entity = channel.addEntity(createEntity(1, 1, 1))
        const nid = entity.nid

        channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })
        writer.props.x(entity, 5)
        expect(channel.cellHasManualUpdates(channel.getVisibleCellKeys(user.id)[0])).toBe(true)

        channel.destroy()

        expect(channel.entities.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(localState.channels.has(channel as any)).toBe(false)
        expect(localState.sources.has(nid)).toBe(false)
        expect(entity.nid).toBe(0)
        expect(channel.dirtyCells.size).toBe(0)
    })
})
