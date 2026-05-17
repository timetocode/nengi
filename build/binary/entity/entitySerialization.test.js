"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const countEntity_1 = __importDefault(require("./countEntity"));
const readEntity_1 = __importDefault(require("./readEntity"));
const writeEntity_1 = require("./writeEntity");
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
describe('entity serialization', () => {
    it('counts, writes, and reads entity envelope ids separately from schema props', () => {
        const schema = (0, defineSchema_1.defineEntitySchema)({
            x: Binary_1.Binary.Float64,
            label: Binary_1.Binary.String
        });
        const context = new Context_1.Context();
        context.register(7, schema);
        const entity = {
            ntype: 7,
            nid: 33,
            x: 12.5,
            label: 'door'
        };
        const byteLength = (0, countEntity_1.default)(schema, entity, Binary_1.Binary.UInt8, Binary_1.Binary.UInt8);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, writeEntity_1.writeEntity)(entity, schema, writer, Binary_1.Binary.UInt8, Binary_1.Binary.UInt8);
        expect(writer.offset).toBe(byteLength);
        const reader = new BufferBinary_1.TestBufferReader(writer.payload);
        expect((0, readEntity_1.default)(reader, context, Binary_1.Binary.UInt8, Binary_1.Binary.UInt8)).toEqual(entity);
        expect(reader.offset).toBe(byteLength);
    });
});
