"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../Binary");
const defineSchema_1 = require("./defineSchema");
describe('defineSchema helpers', () => {
    it('defines entity schemas without storing envelope fields as properties', () => {
        const schema = (0, defineSchema_1.defineEntitySchema)({
            x: Binary_1.Binary.Float64,
            y: { type: Binary_1.Binary.Float64, interp: true },
            label: Binary_1.Binary.String
        });
        expect(schema.keys).toEqual([
            { key: 0, prop: 'x', type: Binary_1.Binary.Float64, interp: false },
            { key: 1, prop: 'y', type: Binary_1.Binary.Float64, interp: true },
            { key: 2, prop: 'label', type: Binary_1.Binary.String, interp: false }
        ]);
        expect(schema.kind).toBe('entity');
        expect(schema.props.x).toBe(schema.keys[0]);
        expect(schema.props.y).toBe(schema.keys[1]);
        expect(schema.props.label).toBe(schema.keys[2]);
    });
    it('rejects envelope fields on entity schemas', () => {
        expect(() => (0, defineSchema_1.defineEntitySchema)({ ntype: Binary_1.Binary.UInt8 })).toThrow('ntype');
        expect(() => (0, defineSchema_1.defineEntitySchema)({ nid: Binary_1.Binary.UInt16 })).toThrow('nid');
    });
    it('defines message schemas with ntype in the envelope and nid available as payload', () => {
        const schema = (0, defineSchema_1.defineMessageSchema)({
            nid: Binary_1.Binary.UInt32,
            text: Binary_1.Binary.String
        });
        expect(schema.kind).toBe('message');
        expect(schema.keys).toEqual([
            { key: 0, prop: 'nid', type: Binary_1.Binary.UInt32, interp: false },
            { key: 1, prop: 'text', type: Binary_1.Binary.String, interp: false }
        ]);
        expect(() => (0, defineSchema_1.defineMessageSchema)({ ntype: Binary_1.Binary.UInt8 })).toThrow('ntype');
    });
    it('defines payload schemas without automatic network identity fields', () => {
        const schema = (0, defineSchema_1.definePayloadSchema)({
            nid: Binary_1.Binary.UInt32,
            open: Binary_1.Binary.Boolean
        });
        expect(schema.keys).toEqual([
            { key: 0, prop: 'nid', type: Binary_1.Binary.UInt32, interp: false },
            { key: 1, prop: 'open', type: Binary_1.Binary.Boolean, interp: false }
        ]);
    });
});
