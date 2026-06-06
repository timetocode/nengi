import { Channel } from './Channel'
import { ChannelAABB2D } from './ChannelAABB2D'
import { ChannelAABB2DCell } from './ChannelAABB2DCell'
import { ChannelAABB2DSparseGrid } from './ChannelAABB2DSparseGrid'
import { AABB2D } from './AABB2D'
import { User } from './User'
import { IEntity } from '../common/IEntity'
import { LocalState } from './LocalState'

enum NType {
    PlayerEntity = 1, // You may have other types here
    ComponentTest = 2
}

class TestEntity implements IEntity {
    nid: number = 0
    ntype: number = NType.PlayerEntity
    x: number = 0
    y: number = 0
}

class ComponentTest {
    nid: number = 0
    ntype: number = NType.ComponentTest
}

describe('Channel', () => {
    let channel: Channel
    let localState: LocalState
    let user: User
    let entity: TestEntity

    beforeEach(() => {
        localState = new LocalState()
        channel = new Channel(localState)
        // @ts-ignore b/c we don't need real sockets/networking for user tests
        user = new User(undefined, undefined) 
        user.id = 1
        user.instance = { localState } as any
        entity = new TestEntity()
    })

    it('stores an optional developer label without interpreting it', () => {
        const labeled = new Channel(localState, { label: 'chest:inventory' })

        expect(labeled.label).toBe('chest:inventory')
    })

    it('should add 10 entities', () => {
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity()
            channel.addEntity(entity)
            expect(channel.entities.get(entity.nid)).toBe(entity)
        }
        expect(channel.entities.size).toBe(10)
    })

    it('should add 10 entities and remove 10 entities', () => {
        const addedEntities: TestEntity[] = []
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity()
            channel.addEntity(entity)
            addedEntities.push(entity)
        }
        for (const entity of addedEntities) {
            channel.removeEntity(entity)
        }
        expect(channel.entities.size).toBe(0)
    })

    it('should add 10 entities and remove 5 entities', () => {
        const addedEntities: TestEntity[] = []
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity()
            channel.addEntity(entity)
            addedEntities.push(entity)
        }
        for (let i = 0; i < 5; i++) {
            const entity = addedEntities[i]
            channel.removeEntity(entity)
        }
        for (let i = 5; i < 10; i++) {
            const entity = addedEntities[i]
            expect(channel.entities.get(entity.nid)).toBe(entity)
        }
        expect(channel.entities.size).toBe(5)
    })

    it('should add 10 entities and have no entities after being destroyed', () => {
        const addedEntities: TestEntity[] = []
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity()
            channel.addEntity(entity)
            addedEntities.push(entity)
        }
        channel.removeEntity({ nid: 2, ntype: NType.PlayerEntity })
        channel.removeEntity({ nid: 6, ntype: NType.PlayerEntity })

        {
            const entity = new TestEntity()
            channel.addEntity(entity)
            addedEntities.push(entity)
        }
        channel.destroy()

        expect(channel.entities.size).toBe(0)
    })

    it('should add an entity', () => {
        channel.addEntity(entity)
        expect(channel.entities.get(entity.nid)).toBe(entity)
    })

    it('should remove an entity', () => {
        channel.addEntity(entity)
        channel.removeEntity(entity)
        expect(channel.entities.get(entity.nid)).toBeUndefined()
    })

    it('stores channel broadcast messages until the snapshot boundary', () => {
        channel.subscribe(user)
        const spy = jest.spyOn(user, 'queueMessage')
        const testMessage = 'test message'
        channel.addMessage(testMessage)
        expect(channel.broadcastMessages).toEqual([testMessage])
        expect(spy).not.toHaveBeenCalled()

        channel.clearBroadcastMessages()

        expect(channel.broadcastMessages).toEqual([])
    })

    it('should subscribe a user', () => {
        channel.subscribe(user)
        expect(channel.users.has(user.id)).toBeTruthy()
    })

    it('should unsubscribe a user', () => {
        channel.subscribe(user)
        channel.unsubscribe(user)
        expect(channel.users.has(user.id)).toBeFalsy()
    })

    it('should return all visible entities for a user', () => {
        channel.addEntity(entity)
        const visibleEntities = channel.getVisibleEntities(user.id)
        expect(visibleEntities).toContain(entity.nid)
    })

    it('should destroy all users and entities', () => {
        channel.addEntity(entity)
        const entityNid = entity.nid
        channel.subscribe(user)
        channel.destroy()
        expect(channel.entities.size).toBe(0)
        expect(channel.users.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(localState.channels.has(channel)).toBe(false)
        expect(localState.sources.has(entityNid)).toBe(false)
    })

    it('can unsubscribe all users without removing entities', () => {
        channel.addEntity(entity)
        channel.subscribe(user)

        channel.unsubscribeAll()

        expect(channel.users.size).toBe(0)
        expect(user.subscriptions.has(channel.nid)).toBe(false)
        expect(channel.entities.get(entity.nid)).toBe(entity)
    })

    it('can remove all direct entities without mutating during iteration', () => {
        const addedEntities: TestEntity[] = []
        for (let i = 0; i < 10; i++) {
            const next = new TestEntity()
            channel.addEntity(next)
            addedEntities.push(next)
        }

        channel.removeAllEntities()

        expect(channel.entities.size).toBe(0)
        addedEntities.forEach(removed => {
            expect(removed.nid).toBe(0)
        })
    })

    it('component test', () =>  {
        const c = new ComponentTest()
        const e = new TestEntity()

        channel.addEntity(e)
        // attach a component to the entity
        localState.addChild(e, c)

        channel.destroy()
        expect(channel.entities.size).toBe(0)
    })

    it('cascades child visibility from a visible parent entity', () => {
        const child = new ComponentTest()
        channel.addEntity(entity)
        localState.addChild(entity, child)
        channel.subscribe(user)

        const visible = user.checkVisibility(1)

        expect(visible.toCreate).toEqual([entity.nid, child.nid])
        expect(visible.toUpdate).toEqual([])
        expect(visible.toDelete).toEqual([])
    })

    it('removes child visibility when the parent source is no longer visible', () => {
        const child = new ComponentTest()
        channel.addEntity(entity)
        localState.addChild(entity, child)
        channel.subscribe(user)

        user.checkVisibility(1)
        const parentNid = entity.nid
        const childNid = child.nid

        channel.removeEntity(entity)
        const visible = user.checkVisibility(2)

        expect(visible.toCreate).toEqual([])
        expect(visible.toUpdate).toEqual([])
        expect(visible.toDelete).toEqual([childNid, parentNid])
        expect(child.nid).toBe(0)
    })

    it('keeps stable child visibility update and delete accounting correct', () => {
        const child = new ComponentTest()
        channel.addEntity(entity)
        localState.addChild(entity, child)
        channel.subscribe(user)

        const first = user.checkVisibility(1)
        const second = user.checkVisibility(2)
        const parentNid = entity.nid
        const childNid = child.nid

        expect(first.toCreate).toEqual([parentNid, childNid])
        expect(second.toCreate).toEqual([])
        expect(second.toUpdate).toEqual([parentNid, childNid])
        expect(second.toDelete).toEqual([])

        channel.removeEntity(entity)
        const third = user.checkVisibility(3)

        expect(third.toCreate).toEqual([])
        expect(third.toUpdate).toEqual([])
        expect(third.toDelete).toEqual([childNid, parentNid])
    })

    it('orders nested hierarchy deletes from deepest child to root parent', () => {
        const child = new ComponentTest()
        const grandchild = new ComponentTest()

        channel.addEntity(entity)
        localState.addChild(entity, child)
        localState.addChild(child, grandchild)
        channel.subscribe(user)

        user.checkVisibility(1)
        const parentNid = entity.nid
        const childNid = child.nid
        const grandchildNid = grandchild.nid

        channel.removeEntity(entity)
        const visible = user.checkVisibility(2)

        expect(visible.toCreate).toEqual([])
        expect(visible.toUpdate).toEqual([])
        expect(visible.toDelete).toEqual([grandchildNid, childNid, parentNid])
    })

    it('prevents a child entity from also being directly channel-owned', () => {
        const child = new ComponentTest()
        const childChannel = new Channel(localState)

        channel.addEntity(entity)
        localState.addChild(entity, child)

        expect(() => childChannel.addEntity(child)).toThrow('already networked by another source')
    })

    it('updates culled channel visibility when a user view changes', () => {
        const culled = new ChannelAABB2D(localState)
        const near = new TestEntity()
        near.x = 10
        near.y = 10
        const far = new TestEntity()
        far.x = 200
        far.y = 200

        culled.addEntity(near)
        culled.addEntity(far)
        culled.subscribe(user, new AABB2D(0, 0, 50, 50))

        expect(culled.getVisibleEntities(user.id)).toEqual([near.nid])

        culled.updateView(user, new AABB2D(200, 200, 50, 50))

        expect(culled.getVisibleEntities(user.id)).toEqual([far.nid])
    })

    it('uses a sparse grid to query only entities inside an AABB view', () => {
        const grid = new ChannelAABB2DSparseGrid(localState, 50)
        const near = new TestEntity()
        near.x = 10
        near.y = 10
        const edge = new TestEntity()
        edge.x = 50
        edge.y = 10
        const far = new TestEntity()
        far.x = 200
        far.y = 200

        grid.addEntity(near)
        grid.addEntity(edge)
        grid.addEntity(far)
        grid.subscribe(user, new AABB2D(25, 25, 25, 25))

        expect(grid.getVisibleEntities(user.id)).toEqual([near.nid])
    })

    it('updates sparse grid visibility when an entity changes cells', () => {
        const grid = new ChannelAABB2DSparseGrid(localState, 50)
        const moving = new TestEntity()
        moving.x = 200
        moving.y = 200

        grid.addEntity(moving)
        grid.subscribe(user, new AABB2D(0, 0, 25, 25))

        expect(grid.getVisibleEntities(user.id)).toEqual([])

        moving.x = 10
        moving.y = 10
        grid.updateEntity(moving)

        expect(grid.getVisibleEntities(user.id)).toEqual([moving.nid])
    })

    it('removes entities from sparse grid cells', () => {
        const grid = new ChannelAABB2DSparseGrid(localState, 50)
        const entity = new TestEntity()
        entity.x = 10
        entity.y = 10

        grid.addEntity(entity)
        grid.subscribe(user, new AABB2D(0, 0, 25, 25))
        const nid = entity.nid

        grid.removeEntity(entity)

        expect(grid.getVisibleEntities(user.id)).toEqual([])
        expect(entity.nid).toBe(0)
        expect(localState.sources.has(nid)).toBe(false)
    })

    it('does not include an untouched sparse grid boundary cell', () => {
        const grid = new ChannelAABB2DSparseGrid(localState, 50)
        const insideCell = new TestEntity()
        insideCell.x = 10
        insideCell.y = 10
        const nextCell = new TestEntity()
        nextCell.x = 50
        nextCell.y = 10

        grid.addEntity(insideCell)
        grid.addEntity(nextCell)
        grid.subscribe(user, new AABB2D(25, 25, 25, 25))

        expect(grid.getVisibleEntities(user.id)).toEqual([insideCell.nid])
    })

    it('expands sparse grid exact queries by queryPadding', () => {
        const grid = new ChannelAABB2DSparseGrid(localState, 50, { queryPadding: 10 })
        const nearEdge = new TestEntity()
        nearEdge.x = 18
        nearEdge.y = 10

        grid.addEntity(nearEdge)
        grid.subscribe(user, new AABB2D(10, 10, 5, 5))

        expect(grid.getVisibleEntities(user.id)).toEqual([nearEdge.nid])
    })

    it('uses whole-cell visibility in cell channels', () => {
        const cells = new ChannelAABB2DCell(localState, 50)
        const insideView = new TestEntity()
        insideView.x = 10
        insideView.y = 10
        const sameCellOutsideExactView = new TestEntity()
        sameCellOutsideExactView.x = 45
        sameCellOutsideExactView.y = 45
        const nextCell = new TestEntity()
        nextCell.x = 55
        nextCell.y = 10

        cells.addEntity(insideView)
        cells.addEntity(sameCellOutsideExactView)
        cells.addEntity(nextCell)
        cells.subscribe(user, new AABB2D(10, 10, 5, 5))

        expect(cells.getVisibleEntities(user.id)).toEqual([insideView.nid, sameCellOutsideExactView.nid])
        expect(cells.getVisibleCellKeys(user.id)).toEqual(['0:0'])
    })

    it('updates cell channel visibility when a user view changes', () => {
        const cells = new ChannelAABB2DCell(localState, 50)
        const first = new TestEntity()
        first.x = 10
        first.y = 10
        const second = new TestEntity()
        second.x = 60
        second.y = 10

        cells.addEntity(first)
        cells.addEntity(second)
        cells.subscribe(user, new AABB2D(10, 10, 5, 5))

        expect(cells.getVisibleEntities(user.id)).toEqual([first.nid])

        cells.updateView(user, new AABB2D(60, 10, 5, 5))

        expect(cells.getVisibleEntities(user.id)).toEqual([second.nid])
    })

    it('updates cell channel membership when an entity changes cells', () => {
        const cells = new ChannelAABB2DCell(localState, 50)
        const moving = new TestEntity()
        moving.x = 10
        moving.y = 10

        cells.addEntity(moving)
        cells.subscribe(user, new AABB2D(60, 10, 5, 5))

        expect(cells.getVisibleEntities(user.id)).toEqual([])

        moving.x = 60
        cells.updateEntity(moving)

        expect(cells.getVisibleEntities(user.id)).toEqual([moving.nid])
        expect(cells.dirtyCells.has('0:0')).toBe(true)
        expect(cells.dirtyCells.has('1:0')).toBe(true)
    })

    it('removes entities from cell channels', () => {
        const cells = new ChannelAABB2DCell(localState, 50)
        const entity = new TestEntity()
        entity.x = 10
        entity.y = 10

        cells.addEntity(entity)
        cells.subscribe(user, new AABB2D(10, 10, 5, 5))
        const nid = entity.nid

        cells.removeEntity(entity)

        expect(cells.getVisibleEntities(user.id)).toEqual([])
        expect(entity.nid).toBe(0)
        expect(localState.sources.has(nid)).toBe(false)
    })
})
