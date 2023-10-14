import { Channel } from './Channel'
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
        entity = new TestEntity()
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
        expect(channel.entities.get(entity.nid)).toBeNull()
    })

    /*
    it('should add a message to all users', () => {
        channel.subscribe(user)
        const spy = jest.spyOn(user, 'queueMessage')
        const testMessage = 'test message'
        channel.addMessage(testMessage)
        expect(spy).toHaveBeenCalledWith(testMessage)
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
    */

    it('should return all visible entities for a user', () => {
        channel.addEntity(entity)
        const visibleEntities = channel.getVisibileEntities(user.id)
        expect(visibleEntities).toContain(entity.nid)
    })

    it('should destroy all users and entities', () => {
        channel.addEntity(entity)
        channel.subscribe(user)
        channel.destroy()
        expect(channel.entities.size).toBe(0)
        expect(channel.users.size).toBe(0)
    })

    it('component test', () =>  {
        const c = new ComponentTest()
        const e = new TestEntity()

        channel.addEntity(e)
        // attach a component to the entity
        localState.addChild(e.nid, c)

        channel.destroy()
        expect(channel.entities.size).toBe(0)
    })
})
