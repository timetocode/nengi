"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalState = void 0;
const EDictionary_1 = require("./EDictionary");
const IdPool_1 = require("./IdPool");
class LocalState {
    constructor() {
        this.entityIdPool = new IdPool_1.IdPool(65535); // TODO pick a real pool size
        this.sources = new Map();
        this.parents = new Map();
        this._entities = new EDictionary_1.EDictionary();
    }
    addChild(parentNid, child) {
        let cnid = this.registerEntity(child, parentNid);
        if (!this.parents.get(parentNid)) {
            this.parents.set(parentNid, new Set());
        }
        this.parents.get(parentNid).add(cnid);
    }
    removeChild(parentNid, child) {
        var _a;
        const cnid = child.nid;
        (_a = this.parents.get(parentNid)) === null || _a === void 0 ? void 0 : _a.delete(cnid);
        this.unregisterEntity(child, parentNid);
    }
    registerEntity(entity, sourceId) {
        let nid = entity.nid;
        if (!this.sources.has(nid)) {
            nid = this.entityIdPool.nextId();
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
            this.entityIdPool.returnId(nid);
            entity.nid = 0;
        }
    }
    getByNid(nid) {
        return this._entities.get(nid);
    }
}
exports.LocalState = LocalState;
//# sourceMappingURL=LocalState.js.map