import { Channel } from './Channel'
import { User } from '../User'
import { IEntity } from '../../common/IEntity'
import { LocalState } from '../LocalState'

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

    it('should ignore stale remove objects instead of removing by nid alone', () => {
        channel.addEntity(entity)
        const nid = entity.nid
        const stale = { nid, ntype: NType.PlayerEntity }

        expect(channel.removeEntity(stale)).toBe(0)
        expect(channel.entities.get(nid)).toBe(entity)
        expect(localState.sources.has(nid)).toBe(true)
        expect(entity.nid).toBe(nid)
    })

    it('returns the removed nid before clearing the entity nid', () => {
        channel.addEntity(entity)
        const nid = entity.nid

        expect(channel.removeEntity(entity)).toBe(nid)
        expect(entity.nid).toBe(0)
    })

    it('should add 10 entities and have no entities after being destroyed', () => {
        const addedEntities: TestEntity[] = []
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity()
            channel.addEntity(entity)
            addedEntities.push(entity)
        }
        channel.removeEntity(addedEntities[1])
        channel.removeEntity(addedEntities[5])

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

    it('registers an optional channel header separately from normal entities', () => {
        const header = new TestEntity()
        channel.setHeader(header)

        expect(channel.getHeader()).toBe(header)
        expect(channel.headerVersion).toBe(1)
        expect(header.nid).toBeGreaterThan(0)
        expect(channel.entities.size).toBe(0)
        expect(localState.sources.has(header.nid)).toBe(true)

        header.x = 5
        expect(channel.markHeaderDirty()).toBe(true)
        expect(channel.headerVersion).toBe(2)
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
})
