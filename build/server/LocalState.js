"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const EDictionary_1 = __importDefault(require("./EDictionary"));
const IdPool_1 = __importDefault(require("./IdPool"));
class LocalState {
    constructor() {
        this.idPool = new IdPool_1.default(65535); // TODO pick a real pool size
        this.sources = new Map();
        this.parents = new Map();
        this._entities = new EDictionary_1.default();
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
            nid = this.idPool.nextId();
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
            this.idPool.returnId(nid);
            entity.nid = 0;
        }
    }
    getByNid(nid) {
        return this._entities.get(nid);
    }
}
exports.default = LocalState;
