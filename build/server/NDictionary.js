"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NDictionary = void 0;
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
    removeAll() {
        this.array.length = 0;
        this.nidIndex.clear();
    }
    forEach(fn) {
        for (let i = 0; i < this.array.length; i++) {
            fn(this.array[i], i);
        }
    }
    get size() {
        return this.array.length;
    }
}
exports.NDictionary = NDictionary;
