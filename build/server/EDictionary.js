"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class EDictionary {
    constructor() {
        this.object = {};
        this.array = [];
    }
    get size() {
        return this.array.length;
    }
    get(nid) {
        var obj = this.object[nid];
        if (typeof obj !== 'undefined') {
            return this.object[nid];
        }
        return null;
    }
    forEach(fn) {
        for (let i = 0; i < this.array.length; i++) {
            fn(this.array[i], i);
        }
    }
    toArray() {
        return this.array;
    }
    add(obj) {
        if (typeof obj === 'object' && typeof obj.nid !== 'undefined') {
            this.object[obj.nid] = obj;
            this.array.push(obj);
        }
        else {
            throw new Error('EDictionary could not add object, invalid object or object.id.');
        }
    }
    remove(obj) {
        if (typeof obj === 'object' && typeof obj.nid !== 'undefined') {
            return this.removeById(obj.nid);
        }
        else {
            //throw new Error('EDictionary could not remove object, invalid object or object.id.')
        }
    }
    removeById(id) {
        if (typeof id !== 'undefined') {
            var index = -1;
            for (var i = 0; i < this.array.length; i++) {
                if (this.array[i].nid === id) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                this.array.splice(index, 1);
            }
            else {
                //throw new Error('EDictionary could not remove object, id not found.')
            }
            var temp = this.object[id];
            delete this.object[id];
            return temp;
        }
        else {
            //throw new Error('EDictionary could not removeById, invalid id.')
        }
    }
}
exports.default = EDictionary;
