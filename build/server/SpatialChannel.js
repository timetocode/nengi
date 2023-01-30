"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpatialChannel = void 0;
const EDictionary_1 = __importDefault(require("./EDictionary"));
class SpatialChannel {
    constructor(localState, id) {
        this.id = id;
        this.localState = localState;
        this.entities = new EDictionary_1.default();
        this.users = new Map();
        this.views = new Map();
        this.destroyed = false;
    }
    addEntity(entity) {
        // TODO
        //if (!entity.protocol) {
        //    throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        //}
        this.localState.registerEntity(entity, this.id);
        this.entities.add(entity);
        /*
        this.users.forEach(user => {
            user.queueEngineMessage({
                ntype: EngineMessage.ChannelAddEntity,
                cid: this.id,
                eid: entity.id
            })
        })
        */
        return entity;
    }
    removeEntity(entity) {
        //console.log('channel removeEntity', entity[this.config.ID_PROPERTY_NAME])
        this.entities.remove(entity);
        /*
        this.users.forEach(user => {
            user.queueEngineMessage({
                ntype: EngineMessage.ChannelRemoveEntity,
                cid: this.id,
                eid: entity.id
            })
        })
        */
        this.localState.unregisterEntity(entity, this.id);
    }
    addMessage(message) {
        //console.log('channel addMessage', message)
        //message[this.config.TYPE_PROPERTY_NAME] = this.instance.protocols.getIndex(message.protocol)
        this.users.forEach(user => {
            user.queueMessage(message);
        });
    }
    getVisible(userId) {
        const visibleNids = [];
        const view = this.views.get(userId);
        const startX = view.x - view.halfWidth;
        const startY = view.y - view.halfHeight;
        const endX = view.x + view.halfWidth;
        const endY = view.y + view.halfHeight;
        for (let i = 0; i < this.entities.array.length; i++) {
            const entity = this.entities.array[i];
            // TODO: how do we know the entities will have spatial data here?
            // @ts-ignore
            if (entity.x >= startX && entity.x <= endX && entity.y >= startY && entity.y <= endY) {
                visibleNids.push(entity.nid);
            }
        }
        return visibleNids;
    }
    // TODO
    subscribe(user, view) {
        this.users.set(user.id, user);
        this.views.set(user.id, view);
        user.subscribe(this);
        /*
        const eids = []
        user.queueEngineMessage({
            ntype: EngineMessage.ChannelJoin,
            cid: this.id,
            eids: entity.id
        })
        */
    }
    // TODO
    unsubscribe(user) {
        this.users.delete(user);
        user.unsubscribe(this);
    }
    destroy() {
        this.users.forEach(user => this.unsubscribe(user));
        this.entities.forEach(entity => this.removeEntity(entity));
        //this.instance.channels.remove(this)
        this.destroyed = true;
        //this.instance.channelCount--
    }
}
exports.SpatialChannel = SpatialChannel;
