"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CulledChannel = void 0;
const Channel_1 = require("./Channel");
class CulledChannel {
    constructor(localState, visibilityResolver) {
        this.views = new Map();
        this.channel = new Channel_1.Channel(localState);
        this.visibilityResolver = visibilityResolver;
    }
    get nid() {
        return this.channel.nid;
    }
    addEntity(entity) {
        return this.channel.addEntity(entity);
    }
    removeEntity(entity) {
        return this.channel.removeEntity(entity);
    }
    addMessage(message) {
        this.channel.users.forEach((user, userId) => {
            const view = this.views.get(userId);
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message);
            }
        });
    }
    subscribe(user, view) {
        this.channel.subscribe(user);
        this.views.set(user.id, view);
    }
    unsubscribe(user) {
        this.channel.unsubscribe(user);
        this.views.delete(user.id);
    }
    getVisibleEntities(userId) {
        const view = this.views.get(userId);
        const visibleEntities = [];
        if (view) {
            this.channel.entities.forEach((entity) => {
                if (this.visibilityResolver(entity, view)) {
                    visibleEntities.push(entity.nid);
                }
            });
        }
        return visibleEntities;
    }
}
exports.CulledChannel = CulledChannel;
