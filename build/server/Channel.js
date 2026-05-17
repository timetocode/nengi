"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const NDictionary_1 = require("./NDictionary");
class Channel {
    constructor(localState, options = {}) {
        this.entities = new NDictionary_1.NDictionary();
        this.users = new Map();
        this.historian = null;
        this.localState = localState;
        this.nid = localState.nidPool.nextId();
        this.label = options.label;
        if (options.historian) {
            this.historian = options.historian;
        }
        this.localState.channels.add(this);
    }
    tick(tick) {
        if (this.historian !== null) {
            this.historian.record(tick, this.entities);
        }
    }
    addEntity(entity) {
        this.localState.registerEntity(entity, this.nid);
        this.entities.add(entity);
        return entity;
    }
    removeEntity(entity) {
        this.entities.remove(entity);
        this.localState.unregisterEntity(entity, this.nid);
    }
    addMessage(message) {
        this.users.forEach(user => user.queueMessage(message));
    }
    subscribe(user) {
        this.users.set(user.id, user);
        user.subscribe(this);
    }
    unsubscribe(user) {
        this.users.delete(user.id);
        user.unsubscribe(this);
    }
    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user));
    }
    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity));
        this.entities.removeAll();
    }
    getVisibleEntities(userId) {
        const visibleNids = [];
        this.entities.forEach((entity) => {
            visibleNids.push(entity.nid);
        });
        return visibleNids;
    }
    destroy() {
        this.unsubscribeAll();
        this.removeAllEntities();
        this.localState.nidPool.returnId(this.nid);
        this.localState.channels.delete(this);
    }
}
exports.Channel = Channel;
