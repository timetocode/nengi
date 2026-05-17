"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdPool = void 0;
class IdPool {
    constructor(max) {
        this.min = 1;
        this.max = max;
        this.ids = new Set();
        this.deferredIds = new Set();
        this.current = this.min - 1;
    }
    isFull() {
        return this.ids.size + this.deferredIds.size >= this.max;
    }
    hasFreshId() {
        return this.current < this.max;
    }
    setMax(max) {
        if (max < this.max) {
            throw new Error('IdPool max cannot shrink.');
        }
        this.max = max;
    }
    nextId() {
        if (this.isFull()) {
            throw new Error('IdPool overflow');
        }
        for (let i = 0; i < this.max; i++) {
            this.current++;
            if (this.current > this.max) {
                this.current = this.min;
            }
            if (!this.ids.has(this.current) && !this.deferredIds.has(this.current)) {
                this.ids.add(this.current);
                return this.current;
            }
        }
        throw new Error('IdPool overflow');
    }
    returnId(id) {
        // Defer reuse until the frame/snapshot boundary so a destroyed entity's
        // nid cannot be recreated in the same server frame.
        if (this.ids.delete(id)) {
            this.deferredIds.add(id);
        }
    }
    releaseDeferredIds() {
        this.deferredIds.clear();
    }
}
exports.IdPool = IdPool;
