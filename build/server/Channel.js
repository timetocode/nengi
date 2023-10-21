"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const NDictionary_1 = require("./NDictionary");
class Channel {
    constructor(localState, ntype) {
        this.nid = 0;
        this.ntype = 0;
        this.users = new Map();
        this._entities = new NDictionary_1.NDictionary();
        this.channelEntity = { nid: 0, ntype };
        localState.addEntity(this.channelEntity);
        this.nid = this.channelEntity.nid;
        this.localState = localState;
    }
    addEntity(entity) {
        this.localState.addChild(entity, this.channelEntity);
        this._entities.add(entity);
        return entity;
    }
    removeEntity(entity) {
        this.localState.removeEntity(entity);
        this._entities.remove(entity);
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
    getVisibileEntities(userId) {
        return this._entities.array.map(e => { return e.nid; });
        //return [this.channelEntity.nid, ...this.localState.children.get(this.channelEntity.nid)!]
    }
    destroy() {
        this.users.forEach(user => user.unsubscribe(this));
        this.localState.removeEntity(this.channelEntity);
    }
}
exports.Channel = Channel;
