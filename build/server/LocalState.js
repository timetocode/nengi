"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalState = void 0;
const IdPool_1 = require("./IdPool");
const NDictionary_1 = require("./NDictionary");
const Binary_1 = require("../common/binary/Binary");
const Protocol_1 = require("../common/binary/Protocol");
class LocalState {
    constructor() {
        this.nidType = Binary_1.Binary.UInt8;
        this.nidPool = new IdPool_1.IdPool((0, Protocol_1.maxValueForNetworkType)(Binary_1.Binary.UInt8));
        /**
         * Entity nid -> source ids currently keeping that entity networked.
         * Source ids can be channels or parent entity nids. They are networking
         * references, not ownership of the user's game object.
         */
        this.sources = new Map();
        /**
         * Parent entity nid -> child entity nids. Children cascade visibility from
         * the parent, but userland still owns object lifetime and game semantics.
         */
        this.children = new Map();
        this._entities = new NDictionary_1.NDictionary();
        this.channels = new Set();
    }
    tick(tick) {
        this.channels.forEach(channel => channel.tick(tick));
    }
    addChild(parentNid, child) {
        const cnid = this.registerEntity(child, parentNid);
        if (!this.children.get(parentNid)) {
            this.children.set(parentNid, new Set());
        }
        this.children.get(parentNid).add(cnid);
    }
    removeChild(parentNid, child) {
        var _a;
        const cnid = child.nid;
        (_a = this.children.get(parentNid)) === null || _a === void 0 ? void 0 : _a.delete(cnid);
        this.unregisterEntity(child, parentNid);
    }
    registerEntity(entity, sourceId) {
        let nid = entity.nid;
        if (!this.sources.has(nid)) {
            if (!this.nidPool.hasFreshId() && this.nidPool.isFull()) {
                const nextType = (0, Protocol_1.nextNetworkType)(this.nidType);
                if (!nextType) {
                    throw new Error('No nid values are available.');
                }
                this.nidType = nextType;
                this.nidPool.setMax((0, Protocol_1.maxValueForNetworkType)(nextType));
            }
            nid = this.nidPool.nextId();
            entity.nid = nid;
            this.sources.set(nid, new Set());
            this._entities.add(entity);
        }
        const entitySources = this.sources.get(nid);
        entitySources.add(sourceId);
        return nid;
    }
    unregisterEntity(entity, sourceId) {
        const nid = entity.nid;
        const entitySources = this.sources.get(nid);
        entitySources.delete(sourceId);
        if (entitySources.size === 0) {
            this.sources.delete(nid);
            this._entities.remove(entity);
            this.nidPool.returnId(nid);
            entity.nid = 0;
        }
    }
    getByNid(nid) {
        return this._entities.get(nid);
    }
    releaseDeferredIds() {
        // Returned nids become reusable only after the snapshot boundary.
        this.nidPool.releaseDeferredIds();
    }
}
exports.LocalState = LocalState;
