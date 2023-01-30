"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const EDictionary_1 = __importDefault(require("./EDictionary"));
class Channel {
    constructor(localState, id) {
        this.id = id;
        this.localState = localState;
        this.entities = new EDictionary_1.default();
        this.users = new Map();
        this.destroyed = false;
    }
    addEntity(entity) {
        // TODO
        //if (!entity.protocol) {
        //    throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        //}
        this.localState.registerEntity(entity, this.id);
        this.entities.add(entity);
        //console.log('added', entity)
        return entity;
    }
    removeEntity(entity) {
        //console.log('channel removeEntity', entity[this.config.ID_PROPERTY_NAME])
        this.entities.remove(entity);
        this.localState.unregisterEntity(entity, this.id);
    }
    addMessage(message) {
        //console.log('channel addMessage', message)
        //message[this.config.TYPE_PROPERTY_NAME] = this.instance.protocols.getIndex(message.protocol)
        this.users.forEach(user => {
            user.queueMessage(message);
        });
    }
    // TODO
    subscribe(user) {
        this.users.set(user.id, user);
        user.subscribe(this);
    }
    // TODO
    unsubscribe(user) {
        this.users.delete(user);
        user.unsubscribe(this);
    }
    getVisible(userId) {
        const visibleNids = [];
        this.entities.forEach(entity => {
            visibleNids.push(entity.nid);
        });
        return visibleNids;
    }
    destroy() {
        this.users.forEach(user => this.unsubscribe(user));
        this.entities.forEach(entity => this.removeEntity(entity));
        //this.instance.channels.remove(this)
        this.destroyed = true;
        //this.instance.channelCount--
    }
}
exports.Channel = Channel;
