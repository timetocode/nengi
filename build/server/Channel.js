"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const EDictionary_1 = require("./EDictionary");
class Channel {
    constructor(localState) {
        this.id = 0;
        this.localState = localState;
        this.entities = new EDictionary_1.EDictionary();
        this.users = new Map();
        this.onSubscribe = (user, channel) => { };
        this.onUnsubscribe = (user, channel) => { };
    }
    addEntity(entity) {
        this.localState.registerEntity(entity, this.id);
        this.entities.add(entity);
        return entity;
    }
    removeEntity(entity) {
        this.entities.remove(entity);
        this.localState.unregisterEntity(entity, this.id);
    }
    addMessage(message) {
        this.users.forEach(user => user.queueMessage(message));
    }
    subscribe(user) {
        this.users.set(user.id, user);
        user.subscribe(this);
        this.onSubscribe(user, this);
    }
    unsubscribe(user) {
        this.onUnsubscribe(user, this);
        this.users.delete(user.id);
        user.unsubscribe(this);
    }
    getVisibileEntities(userId) {
        const visibleNids = [];
        this.entities.forEach((entity) => {
            visibleNids.push(entity.nid);
        });
        return visibleNids;
    }
    destroy() {
        this.users.forEach(user => this.unsubscribe(user));
        this.entities.forEachReverse(entity => this.removeEntity(entity));
    }
}
exports.Channel = Channel;
