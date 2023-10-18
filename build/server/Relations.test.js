"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalState = exports.NDictionary = void 0;
const IdPool_1 = require("./IdPool");
class NDictionary {
    constructor() {
        this.array = [];
        this.nidIndex = new Map();
    }
    get(nid) {
        return this.array[this.nidIndex.get(nid)];
    }
    add(entity) {
        const length = this.array.push(entity);
        this.nidIndex.set(entity.nid, length - 1);
    }
    remove(entity) {
        const nid = entity.nid;
        const indexToRemove = this.nidIndex.get(nid);
        const lastIndex = this.array.length - 1;
        // If the element to remove is not the last one, swap and pop.
        if (indexToRemove !== lastIndex) {
            const otherNid = this.array[lastIndex].nid;
            [this.array[indexToRemove], this.array[lastIndex]] =
                [this.array[lastIndex], this.array[indexToRemove]];
            // Update nidIndex
            this.nidIndex.set(otherNid, indexToRemove);
        }
        // Remove the entity
        this.array.pop();
        this.nidIndex.delete(nid);
    }
    forEach(fn) {
        for (let i = 0; i < this.array.length; i++) {
            fn(this.array[i], i);
        }
    }
}
exports.NDictionary = NDictionary;
class LocalState {
    constructor() {
        this.nidPool = new IdPool_1.IdPool(65535);
        this.children = new Map();
        this.parents = new Map();
        this._entities = new NDictionary();
    }
    addEntity(entity) {
        if (entity.nid === 0) {
            entity.nid = this.nidPool.nextId();
        }
        this._entities.add(entity);
    }
    addChild(child, parent) {
        const pnid = parent.nid;
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
//import { LocalState, IEntity, nid } from './LocalState'  // Adjust import as needed
//import { IdPool } from './IdPool'  // Adjust import as needed
describe('LocalState', () => {
    // Test for flat game structures
    it('correctly adds and removes flat entities', () => {
        const localState = new LocalState();
        const entity1 = { nid: 0, ntype: 1 };
        const entity2 = { nid: 0, ntype: 2 };
        localState.addEntity(entity1);
        localState.addEntity(entity2);
        expect(localState.getByNid(1).ntype).toBe(1);
        expect(localState.getByNid(2).ntype).toBe(2);
        localState.removeEntity(entity1);
        expect(localState.getByNid(1)).toBeUndefined();
        expect(localState.getByNid(2).ntype).toBe(2);
    });
    // Test for small scene graph structures
    it('adds and removes entities in a scene graph', () => {
        const localState = new LocalState();
        const parent = { nid: 0, ntype: 1 };
        const child1 = { nid: 0, ntype: 2 };
        const child2 = { nid: 0, ntype: 3 };
        localState.addEntity(parent);
        localState.addChild(child1, parent);
        localState.addChild(child2, parent);
        expect(localState.children.get(parent.nid).size).toBe(2);
        localState.removeEntity(child1);
        expect(localState.children.get(parent.nid).size).toBe(1);
        expect(localState.children.get(parent.nid).has(child2.nid)).toBe(true);
    });
    // Test for ECS structures
    it('adds and removes entities in an ECS', () => {
        const localState = new LocalState();
        const entity = { nid: 0, ntype: 1 };
        const component1 = { nid: 0, ntype: 2 };
        const component2 = { nid: 0, ntype: 3 };
        localState.addEntity(entity);
        localState.addChild(component1, entity);
        localState.addChild(component2, entity);
        expect(localState.children.get(entity.nid).size).toBe(2);
        localState.removeEntity(component1);
        expect(localState.children.get(entity.nid).size).toBe(1);
        expect(localState.children.get(entity.nid).has(component2.nid)).toBe(true);
    });
    // Test for recursive removal of orphaned children
    it('recursively removes orphaned children', () => {
        const localState = new LocalState();
        const grandParent = { nid: 0, ntype: 1 };
        const parent = { nid: 0, ntype: 2 };
        const child = { nid: 0, ntype: 3 };
        localState.addEntity(grandParent);
        localState.addChild(parent, grandParent);
        localState.addChild(child, parent);
        expect(localState.children.get(grandParent.nid).has(parent.nid)).toBe(true);
        expect(localState.children.get(parent.nid).has(child.nid)).toBe(true);
        localState.removeEntity(grandParent);
        expect(localState.getByNid(grandParent.nid)).toBeUndefined();
        expect(localState.getByNid(parent.nid)).toBeUndefined();
        expect(localState.getByNid(child.nid)).toBeUndefined();
    });
    // Test for entities with multiple parents
    it('keeps child with multiple parents after one parent is removed', () => {
        const localState = new LocalState();
        const parent1 = { nid: 0, ntype: 1 };
        const parent2 = { nid: 0, ntype: 2 };
        const child = { nid: 0, ntype: 3 };
        localState.addEntity(parent1);
        localState.addEntity(parent2);
        localState.addChild(child, parent1);
        localState.addChild(child, parent2);
        expect(localState.children.get(parent1.nid).has(child.nid)).toBe(true);
        expect(localState.children.get(parent2.nid).has(child.nid)).toBe(true);
        localState.removeEntity(parent1);
        expect(localState.getByNid(parent1.nid)).toBeUndefined();
        expect(localState.getByNid(parent2.nid).ntype).toBe(2);
        expect(localState.getByNid(child.nid).ntype).toBe(3);
    });
});
