"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const countDiff_1 = __importDefault(require("./countDiff"));
const readDiff_1 = __importDefault(require("./readDiff"));
const writeDiff_1 = __importDefault(require("./writeDiff"));
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
describe('entity diff serialization', () => {
    it('counts, writes, and reads a property diff using the schema property key', () => {
        const schema = (0, defineSchema_1.defineEntitySchema)({
            x: Binary_1.Binary.Float64,
            label: Binary_1.Binary.String
        });
        const context = new Context_1.Context();
        context.register(3, schema);
        const ntypes = new Map([[42, 3]]);
        const diff = {
            nid: 42,
            nschema: schema,
            prop: 'label',
            value: 'armed'
        };
        const byteLength = (0, countDiff_1.default)(diff, schema);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, writeDiff_1.default)(diff.nid, diff, schema, writer);
        expect(writer.offset).toBe(byteLength);
        const reader = new BufferBinary_1.TestBufferReader(writer.payload);
        expect((0, readDiff_1.default)(reader, context, ntypes)).toEqual({
            nid: 42,
            prop: 'label',
            value: 'armed'
        });
        expect(reader.offset).toBe(byteLength);
    });
});
