"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Channel_1 = require("./Channel");
const User_1 = require("./User");
const LocalState_1 = require("./LocalState");
var NType;
(function (NType) {
    NType[NType["PlayerEntity"] = 1] = "PlayerEntity";
    NType[NType["ComponentTest"] = 2] = "ComponentTest";
})(NType || (NType = {}));
class TestEntity {
    constructor() {
        this.nid = 0;
        this.ntype = NType.PlayerEntity;
    }
}
class ComponentTest {
    constructor() {
        this.nid = 0;
        this.ntype = NType.ComponentTest;
    }
}
describe('Channel', () => {
    let channel;
    let localState;
    let user;
    let entity;
    beforeEach(() => {
        localState = new LocalState_1.LocalState();
        channel = new Channel_1.Channel(localState);
        // @ts-ignore b/c we don't need real sockets/networking for user tests
        user = new User_1.User(undefined, undefined);
        user.id = 1;
        user.instance = { localState };
        entity = new TestEntity();
    });
    it('stores an optional developer label without interpreting it', () => {
        const labeled = new Channel_1.Channel(localState, { label: 'chest:inventory' });
        expect(labeled.label).toBe('chest:inventory');
    });
    it('should add 10 entities', () => {
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity();
            channel.addEntity(entity);
            expect(channel.entities.get(entity.nid)).toBe(entity);
        }
        expect(channel.entities.size).toBe(10);
    });
    it('should add 10 entities and remove 10 entities', () => {
        const addedEntities = [];
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity();
            channel.addEntity(entity);
            addedEntities.push(entity);
        }
        for (const entity of addedEntities) {
            channel.removeEntity(entity);
        }
        expect(channel.entities.size).toBe(0);
    });
    it('should add 10 entities and remove 5 entities', () => {
        const addedEntities = [];
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity();
            channel.addEntity(entity);
            addedEntities.push(entity);
        }
        for (let i = 0; i < 5; i++) {
            const entity = addedEntities[i];
            channel.removeEntity(entity);
        }
        for (let i = 5; i < 10; i++) {
            const entity = addedEntities[i];
            expect(channel.entities.get(entity.nid)).toBe(entity);
        }
        expect(channel.entities.size).toBe(5);
    });
    it('should add 10 entities and have no entities after being destroyed', () => {
        const addedEntities = [];
        for (let i = 0; i < 10; i++) {
            const entity = new TestEntity();
            channel.addEntity(entity);
            addedEntities.push(entity);
        }
        channel.removeEntity({ nid: 2, ntype: NType.PlayerEntity });
        channel.removeEntity({ nid: 6, ntype: NType.PlayerEntity });
        {
            const entity = new TestEntity();
            channel.addEntity(entity);
            addedEntities.push(entity);
        }
        channel.destroy();
        expect(channel.entities.size).toBe(0);
    });
    it('should add an entity', () => {
        channel.addEntity(entity);
        expect(channel.entities.get(entity.nid)).toBe(entity);
    });
    it('should remove an entity', () => {
        channel.addEntity(entity);
        channel.removeEntity(entity);
        expect(channel.entities.get(entity.nid)).toBeUndefined();
    });
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
        channel.addEntity(entity);
        const visibleEntities = channel.getVisibleEntities(user.id);
        expect(visibleEntities).toContain(entity.nid);
    });
    it('should destroy all users and entities', () => {
        channel.addEntity(entity);
        const entityNid = entity.nid;
        channel.subscribe(user);
        channel.destroy();
        expect(channel.entities.size).toBe(0);
        expect(channel.users.size).toBe(0);
        expect(user.subscriptions.has(channel.nid)).toBe(false);
        expect(localState.channels.has(channel)).toBe(false);
        expect(localState.sources.has(entityNid)).toBe(false);
    });
    it('can unsubscribe all users without removing entities', () => {
        channel.addEntity(entity);
        channel.subscribe(user);
        channel.unsubscribeAll();
        expect(channel.users.size).toBe(0);
        expect(user.subscriptions.has(channel.nid)).toBe(false);
        expect(channel.entities.get(entity.nid)).toBe(entity);
    });
    it('can remove all direct entities without mutating during iteration', () => {
        const addedEntities = [];
        for (let i = 0; i < 10; i++) {
            const next = new TestEntity();
            channel.addEntity(next);
            addedEntities.push(next);
        }
        channel.removeAllEntities();
        expect(channel.entities.size).toBe(0);
        addedEntities.forEach(removed => {
            expect(removed.nid).toBe(0);
        });
    });
    it('component test', () => {
        const c = new ComponentTest();
        const e = new TestEntity();
        channel.addEntity(e);
        // attach a component to the entity
        localState.addChild(e.nid, c);
        channel.destroy();
        expect(channel.entities.size).toBe(0);
    });
    it('cascades child visibility from a visible parent entity', () => {
        const child = new ComponentTest();
        channel.addEntity(entity);
        localState.addChild(entity.nid, child);
        channel.subscribe(user);
        const visible = user.checkVisibility(1);
        expect(visible.toCreate).toEqual([entity.nid, child.nid]);
        expect(visible.toUpdate).toEqual([]);
        expect(visible.toDelete).toEqual([]);
    });
    it('removes child visibility when the parent source is no longer visible', () => {
        const child = new ComponentTest();
        channel.addEntity(entity);
        localState.addChild(entity.nid, child);
        channel.subscribe(user);
        user.checkVisibility(1);
        const parentNid = entity.nid;
        const childNid = child.nid;
        channel.removeEntity(entity);
        const visible = user.checkVisibility(2);
        expect(visible.toCreate).toEqual([]);
        expect(visible.toUpdate).toEqual([]);
        expect(visible.toDelete).toEqual([parentNid, childNid]);
        expect(child.nid).toBe(childNid);
    });
    it('keeps a child visible when another source still references it', () => {
        const child = new ComponentTest();
        const childChannel = new Channel_1.Channel(localState);
        channel.addEntity(entity);
        localState.addChild(entity.nid, child);
        childChannel.addEntity(child);
        channel.subscribe(user);
        childChannel.subscribe(user);
        user.checkVisibility(1);
        const parentNid = entity.nid;
        const childNid = child.nid;
        channel.removeEntity(entity);
        const visible = user.checkVisibility(2);
        expect(visible.toCreate).toEqual([]);
        expect(visible.toUpdate).toEqual([childNid]);
        expect(visible.toDelete).toEqual([parentNid]);
    });
});
