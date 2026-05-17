"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Schema = void 0;
class Schema {
    constructor(kind = 'payload') {
        this.keys = [];
        this.props = {};
        this.kind = kind;
    }
}
exports.Schema = Schema;
