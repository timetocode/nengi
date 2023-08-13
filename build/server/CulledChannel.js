"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CulledChannel = void 0;
const EDictionary_1 = require("./EDictionary");
class CulledChannel {
    constructor(localState) {
        this.id = 0;
        this.localState = localState;
        this.entities = new EDictionary_1.EDictionary();
        this.users = new Map();
        this.views = new Map();
        this.onSubscribe = (user, channel) => { };
        this.onUnsubscribe = (user, channel) => { };
        this.visibilityResolver = (object, view) => { return true; };
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
        this.users.forEach(user => {
            if (this.visibilityResolver(message, this.views.get(user.id))) {
                user.queueMessage(message);
            }
        });
    }
    subscribe(user, view) {
        this.users.set(user.id, user);
        this.views.set(user.id, view);
        user.subscribe(this);
        this.onSubscribe(user, this);
    }
    unsubscribe(user) {
        this.onUnsubscribe(user, this);
        this.users.delete(user.id);
        this.views.delete(user.id);
        user.unsubscribe(this);
    }
    getVisibileEntities(userId) {
        const view = this.views.get(userId);
        const visibleNids = [];
        this.entities.forEach((entity) => {
            if (this.visibilityResolver(entity, view)) {
                visibleNids.push(entity.nid);
            }
        });
        return visibleNids;
    }
    destroy() {
        this.users.forEach(user => this.unsubscribe(user));
        this.entities.forEach(entity => this.removeEntity(entity));
    }
}
exports.CulledChannel = CulledChannel;
