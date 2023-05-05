"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NQueue = void 0;
class NQueue {
    constructor() {
        this.arr = [];
    }
    isEmpty() {
        return this.arr.length === 0;
    }
    enqueue(item) {
        this.arr.unshift(item);
    }
    dequeue() {
        return this.arr.pop();
    }
    peekNext() {
        return this.arr[this.arr.length - 1];
    }
    get length() {
        return this.arr.length;
    }
    next() {
        return this.dequeue();
    }
}
exports.NQueue = NQueue;
//# sourceMappingURL=NQueue.js.map