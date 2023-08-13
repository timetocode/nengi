"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdPool = void 0;
class IdPool {
    constructor(max) {
        this.min = 1;
        this.max = max;
        this.ids = new Set();
        this.current = this.min - 1;
    }
    nextId() {
        if (this.ids.size >= this.max) {
            throw new Error('IdPool overflow');
        }
        this.current++;
        if (this.current > this.max) {
            this.current = this.min;
        }
        if (!this.ids.has(this.current)) {
            this.ids.add(this.current);
            return this.current;
        }
        else {
            return this.nextId();
        }
    }
    returnId(id) {
        this.ids.delete(id);
    }
}
exports.IdPool = IdPool;
