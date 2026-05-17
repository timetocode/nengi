"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CulledChannel = void 0;
const Channel_1 = require("./Channel");
class CulledChannel {
    constructor(localState, visibilityResolver, options = {}) {
        this.views = new Map();
        this.historian = null;
        this.users = new Map();
        this.channel = new Channel_1.Channel(localState, options);
        this.visibilityResolver = visibilityResolver;
        if (options.historian) {
            this.historian = options.historian;
        }
    }
    get nid() {
        return this.channel.nid;
    }
    get label() {
        return this.channel.label;
    }
    get entities() {
        return this.channel.entities;
    }
    tick(tick) {
        if (this.historian !== null) {
            this.historian.record(tick, this.channel.entities);
        }
    }
    addEntity(entity) {
        return this.channel.addEntity(entity);
    }
    removeEntity(entity) {
        return this.channel.removeEntity(entity);
    }
    removeAllEntities() {
        return this.channel.removeAllEntities();
    }
    addMessage(message) {
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId);
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message);
            }
        });
    }
    subscribe(user, view) {
        this.views.set(user.id, view);
        this.users.set(user.id, user);
        user.subscribe(this);
    }
    unsubscribe(user) {
        this.views.delete(user.id);
        this.users.delete(user.id);
        user.unsubscribe(this);
    }
    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user));
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
    destroy() {
        this.users.forEach(user => this.unsubscribe(user));
        this.channel.destroy();
        this.views = new Map();
        this.visibilityResolver = (obj, view) => { return true; };
    }
}
exports.CulledChannel = CulledChannel;
