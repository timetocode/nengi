"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Channel_1 = require("./Channel");
const User_1 = require("./User");
const LocalState_1 = require("./LocalState");
var NType;
(function (NType) {
    NType[NType["PlayerEntity"] = 1] = "PlayerEntity"; // You may have other types here
})(NType || (NType = {}));
class TestEntity {
    constructor() {
        this.nid = -1;
        this.ntype = NType.PlayerEntity;
    }
}
describe('Channel', () => {
    let channel;
    let localState;
    let user;
    let entity;
    beforeEach(() => {
        localState = new LocalState_1.LocalState(); // Adjust if LocalState requires initial data
        channel = new Channel_1.Channel(localState);
        // @ts-ignore
        user = new User_1.User(undefined, undefined); // Assuming User class has a default constructor
        entity = new TestEntity();
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
        expect(channel.entities.get(entity.nid)).toBeNull();
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
        const visibleEntities = channel.getVisibileEntities(user.id);
        expect(visibleEntities).toContain(entity.nid);
    });
    it('should destroy all users and entities', () => {
        channel.addEntity(entity);
        channel.subscribe(user);
        channel.destroy();
        expect(channel.entities.size).toBe(0);
        expect(channel.users.size).toBe(0);
    });
});
