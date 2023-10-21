"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalState = void 0;
const IdPool_1 = require("./IdPool");
const NDictionary_1 = require("./NDictionary");
class LocalState {
    constructor() {
        this.nidPool = new IdPool_1.IdPool(65535);
        this.children = new Map();
        this.parents = new Map();
        this._entities = new NDictionary_1.NDictionary();
    }
    addEntity(entity) {
        if (entity.nid === 0) {
            entity.nid = this.nidPool.nextId();
        }
        // @ts-ignore
        entity.hasChildren = false;
        this._entities.add(entity);
    }
    addChild(child, parent) {
        const pnid = parent.nid;
        // @ts-ignore
        parent.hasChildren = true;
        this.addEntity(child); // assigns a nid to the child
        const cnid = child.nid;
        if (!this.children.has(pnid)) {
            this.children.set(pnid, new Set());
        }
        this.children.get(pnid).add(cnid);
        if (!this.parents.has(cnid)) {
            this.parents.set(cnid, new Set());
        }
        this.parents.get(cnid).add(pnid);
    }
    removeEntity(entity) {
        const nid = entity.nid;
        if (nid === 0) {
            return;
        }
        // Remove from children
        const childNids = this.children.get(nid);
        if (childNids) {
            for (const cnid of childNids) {
                const childEntity = this._entities.get(cnid);
                if (childEntity) {
                    this.removeEntity(childEntity);
                }
            }
            this.children.delete(nid);
        }
        // Remove as a child from parents and check for orphaned children
        if (this.parents.has(nid)) {
            const parentNids = this.parents.get(nid);
            for (const pnid of parentNids) {
                if (this.children.has(pnid)) {
                    this.children.get(pnid).delete(nid);
                }
            }
            this.parents.delete(nid);
        }
        // Remove as a parent from children
        for (const [pnid, childSet] of this.children.entries()) {
            if (childSet.has(nid)) {
                childSet.delete(nid);
                if (childSet.size === 0) {
                    const parentEntity = this._entities.get(pnid);
                    if (parentEntity) {
                        this.removeEntity(parentEntity);
                    }
                }
            }
        }
        // Remove entity from _entities
        this._entities.remove(entity);
        // Return nid to the pool
        this.nidPool.returnId(nid);
    }
    getByNid(nid) {
        return this._entities.get(nid);
    }
}
exports.LocalState = LocalState;
