"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineSchema = void 0;
const Binary_1 = require("../Binary");
const Schema_1 = require("./Schema");
function defineSchema(schema) {
    //console.log('parsing', schema)
    const compiled = new Schema_1.Schema();
    let index = 0;
    {
        const prop = 'ntype';
        const entry = { key: index, prop, type: Binary_1.Binary.UInt8, interp: false };
        compiled.keys.push(entry);
        compiled.props[prop] = entry;
        index++;
    }
    {
        const prop = 'nid';
        const entry = { key: index, prop, type: Binary_1.Binary.UInt16, interp: false };
        compiled.keys.push(entry);
        compiled.props[prop] = entry;
        index++;
    }
    for (const prop in schema) {
        if (prop === 'nid') {
            throw new Error('No need to define `nid` in a schema, this is added by default.');
        }
        if (prop === 'ntype') {
            throw new Error('No need to define `ntype` in a schema, this is added by default.');
        }
        // @ts-ignore
        if (schema[prop].type) {
            // probably the syntax x: { type: Binary.Float32, interp: true }
            // @ts-ignore
            const entry = { key: index, prop, type: schema[prop].type, interp: schema[prop].interp, };
            compiled.keys.push(entry);
            compiled.props[prop] = entry;
            index++;
        }
        else {
            // probably the syntax x: Binary.Float32
            const entry = { key: index, prop, type: schema[prop], interp: false };
            compiled.keys.push(entry);
            compiled.props[prop] = entry;
            index++;
        }
    }
    return compiled;
}
exports.defineSchema = defineSchema;
