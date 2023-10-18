"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
class Channel {
    constructor(localState, ntype) {
        this.nid = 0;
        this.ntype = 0;
        this.users = new Map();
        this.channelEntity = { nid: 0, ntype };
        localState.addEntity(this.channelEntity);
        this.nid = this.channelEntity.nid;
        this.localState = localState;
    }
    addEntity(entity) {
        this.localState.addChild(entity, this.channelEntity);
        return entity;
    }
    removeEntity(entity) {
        this.localState.removeEntity(entity);
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
        return [this.channelEntity.nid, ...this.localState.children.get(this.channelEntity.nid)];
    }
    destroy() {
        this.users.forEach(user => user.unsubscribe(this));
        this.localState.removeEntity(this.channelEntity);
    }
}
exports.Channel = Channel;
