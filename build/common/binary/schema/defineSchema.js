"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.createEntity = void 0;
exports.defineEntitySchema = defineEntitySchema;
exports.defineMessageSchema = defineMessageSchema;
exports.definePayloadSchema = definePayloadSchema;
const Schema_1 = require("./Schema");
function compileSchema(schema, kind) {
    const compiled = new Schema_1.Schema(kind);
    let index = 0;
    for (const prop in schema) {
        if ((kind === 'entity' || kind === 'message') && prop === 'ntype') {
            throw new Error('No need to define `ntype` in a schema, this is added by the network envelope.');
        }
        if (kind === 'entity' && prop === 'nid') {
            throw new Error('No need to define `nid` in an entity schema, this is added by the entity envelope.');
        }
        const spec = schema[prop];
        if (typeof spec === 'object' && spec !== null && 'type' in spec) {
            // probably the syntax x: { type: Binary.Float32, interp: true }
            const entry = { key: index, prop, type: spec.type, interp: spec.interp, };
            compiled.keys.push(entry);
            compiled.props[prop] = entry;
            index++;
        }
        else {
            // probably the syntax x: Binary.Float32
            const entry = { key: index, prop, type: spec, interp: false };
            compiled.keys.push(entry);
            compiled.props[prop] = entry;
            index++;
        }
    }
    return compiled;
}
function defineEntitySchema(schema) {
    return compileSchema(schema, 'entity');
}
function defineMessageSchema(schema) {
    return compileSchema(schema, 'message');
}
function definePayloadSchema(schema) {
    return compileSchema(schema, 'payload');
}
const createEntity = defineEntitySchema;
exports.createEntity = createEntity;
const createMessage = defineMessageSchema;
exports.createMessage = createMessage;
