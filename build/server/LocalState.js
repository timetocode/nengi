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
        this.dirtyNids = new Set();
        this.dirtySources = new Map();
        this.entityTreeVersion = 0;
        /**
         * Entity nid -> source id currently keeping that entity networked.
         * The set shape is kept for now because the hot visibility path already
         * understands it, but entity ownership is intentionally single-source.
         */
        this.sources = new Map();
        /**
         * Parent entity nid -> child entity nids. Children cascade visibility from
         * the parent, but userland still owns object lifetime and game semantics.
         */
        this.children = new Map();
        this.parentByNid = new Map();
        this.rootByNid = new Map();
        this._entities = new NDictionary_1.NDictionary();
        this.channels = new Set();
        this.treeCache = new Map();
        this.treeDeleteCache = new Map();
    }
    nextNetworkId() {
        if (this.nidPool.isFull()) {
            const nextType = (0, Protocol_1.nextNetworkType)(this.nidType);
            if (!nextType) {
                throw new Error('No nid values are available.');
            }
            this.nidType = nextType;
            this.nidPool.setMax((0, Protocol_1.maxValueForNetworkType)(nextType));
        }
        return this.nidPool.nextId();
    }
    tick(tick) {
        this.channels.forEach(channel => channel.tick(tick));
    }
    assertRegisteredParent(parent) {
        if (parent.nid === 0 || !this.sources.has(parent.nid)) {
            throw new Error('Cannot attach a child to an entity that is not networked.');
        }
    }
    invalidateEntityTreeCache(rootNid) {
        this.entityTreeVersion++;
        this.invalidateEntityTreeSubtree(rootNid);
        let parentNid = this.parentByNid.get(rootNid) || 0;
        while (parentNid) {
            this.treeCache.delete(parentNid);
            this.treeDeleteCache.delete(parentNid);
            parentNid = this.parentByNid.get(parentNid) || 0;
        }
    }
    invalidateEntityTreeSubtree(rootNid) {
        this.treeCache.delete(rootNid);
        this.treeDeleteCache.delete(rootNid);
        const children = this.children.get(rootNid);
        if (!children) {
            return;
        }
        for (const childNid of children) {
            this.invalidateEntityTreeSubtree(childNid);
        }
    }
    addChild(parent, child) {
        this.assertRegisteredParent(parent);
        const existingChildren = this.children.get(parent.nid);
        if (child.nid !== 0 && (existingChildren === null || existingChildren === void 0 ? void 0 : existingChildren.has(child.nid))) {
            return child;
        }
        const cnid = this.registerEntity(child, parent.nid);
        if (!this.children.get(parent.nid)) {
            this.children.set(parent.nid, new Set());
        }
        this.children.get(parent.nid).add(cnid);
        this.parentByNid.set(cnid, parent.nid);
        this.rootByNid.set(cnid, this.rootByNid.get(parent.nid) || parent.nid);
        this.invalidateEntityTreeCache(parent.nid);
        return child;
    }
    removeChild(parent, child) {
        this.assertRegisteredParent(parent);
        const cnid = child.nid;
        if (cnid === 0) {
            return;
        }
        const children = this.children.get(parent.nid);
        if (!children || !children.has(cnid)) {
            return;
        }
        this.invalidateEntityTreeCache(cnid);
        children.delete(cnid);
        this.unregisterEntity(child, parent.nid);
    }
    registerEntity(entity, sourceId) {
        let nid = entity.nid;
        if (nid !== 0 && this.sources.has(nid)) {
            const entitySources = this.sources.get(nid);
            if (entitySources.has(sourceId)) {
                return nid;
            }
            throw new Error(`Entity nid ${nid} is already networked by another source.`);
        }
        if (!this.sources.has(nid)) {
            nid = this.nextNetworkId();
            entity.nid = nid;
            this.sources.set(nid, new Set());
            this._entities.add(entity);
            this.rootByNid.set(nid, nid);
        }
        const entitySources = this.sources.get(nid);
        entitySources.add(sourceId);
        return nid;
    }
    markDirty(entity) {
        if (entity.nid === 0 || !this.sources.has(entity.nid)) {
            return false;
        }
        if (!this.dirtyNids.has(entity.nid)) {
            this.dirtyNids.add(entity.nid);
        }
        const sources = this.sources.get(entity.nid);
        if (sources) {
            this.dirtySources.set(entity.nid, new Set(sources));
        }
        return true;
    }
    isDirty(nid) {
        return this.dirtyNids.has(nid);
    }
    clearDirty() {
        this.dirtyNids.clear();
        this.dirtySources.clear();
    }
    unregisterEntity(entity, sourceId) {
        const nid = entity.nid;
        const entitySources = this.sources.get(nid);
        if (!entitySources) {
            return;
        }
        entitySources.delete(sourceId);
        if (entitySources.size === 0) {
            this.invalidateEntityTreeCache(nid);
            this.unregisterChildren(nid);
            this.sources.delete(nid);
            this.dirtyNids.delete(nid);
            this.dirtySources.delete(nid);
            this.parentByNid.delete(nid);
            this.rootByNid.delete(nid);
            this._entities.remove(entity);
            this.nidPool.returnId(nid);
            entity.nid = 0;
        }
    }
    getByNid(nid) {
        return this._entities.get(nid);
    }
    getParentNid(nid) {
        return this.parentByNid.get(nid) || 0;
    }
    getRootNid(nid) {
        return this.rootByNid.get(nid) || 0;
    }
    forEachEntityTree(rootNid, fn) {
        const tree = this.getEntityTree(rootNid);
        for (let i = 0; i < tree.length; i++) {
            fn(tree[i]);
        }
    }
    buildEntityTree(rootNid, out) {
        out.push(rootNid);
        const children = this.children.get(rootNid);
        if (children) {
            for (const childNid of children) {
                this.buildEntityTree(childNid, out);
            }
        }
        return out;
    }
    getEntityTree(rootNid) {
        let tree = this.treeCache.get(rootNid);
        if (!tree) {
            tree = this.buildEntityTree(rootNid, []);
            this.treeCache.set(rootNid, tree);
        }
        return tree;
    }
    collectEntityTree(rootNid, out) {
        const tree = this.getEntityTree(rootNid);
        for (let i = 0; i < tree.length; i++) {
            out.push(tree[i]);
        }
        return out;
    }
    buildEntityTreeDeletes(rootNid, out) {
        const children = this.children.get(rootNid);
        if (children) {
            for (const childNid of children) {
                this.buildEntityTreeDeletes(childNid, out);
            }
        }
        out.push(rootNid);
        return out;
    }
    getEntityTreeDeletes(rootNid) {
        let tree = this.treeDeleteCache.get(rootNid);
        if (!tree) {
            tree = this.buildEntityTreeDeletes(rootNid, []);
            this.treeDeleteCache.set(rootNid, tree);
        }
        return tree;
    }
    collectEntityTreeDeletes(rootNid, out) {
        const tree = this.getEntityTreeDeletes(rootNid);
        for (let i = 0; i < tree.length; i++) {
            out.push(tree[i]);
        }
        return out;
    }
    unregisterChildren(parentNid) {
        const children = this.children.get(parentNid);
        if (!children) {
            return;
        }
        const childNids = Array.from(children);
        for (let i = 0; i < childNids.length; i++) {
            const child = this.getByNid(childNids[i]);
            if (child) {
                this.unregisterEntity(child, parentNid);
            }
        }
        this.children.delete(parentNid);
    }
    releaseDeferredIds() {
        // Returned nids become reusable only after the snapshot boundary.
        this.nidPool.releaseDeferredIds();
    }
}
exports.LocalState = LocalState;
