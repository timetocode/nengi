"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const count_1 = __importDefault(require("./count"));
const readMessage_1 = __importDefault(require("./readMessage"));
const writeMessage_1 = require("./writeMessage");
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
describe('message serialization', () => {
    it('counts, writes, and reads a schema-backed message without a hardcoded nid', () => {
        const schema = (0, defineSchema_1.defineMessageSchema)({
            kind: Binary_1.Binary.UInt8,
            text: Binary_1.Binary.String,
            position: { type: Binary_1.Binary.Vector2, interp: true },
            active: Binary_1.Binary.Boolean
        });
        const context = new Context_1.Context();
        context.register(7, schema);
        const message = {
            ntype: 7,
            kind: 2,
            text: 'open',
            position: { x: 12.5, y: -4.25 },
            active: true
        };
        const byteLength = (0, count_1.default)(schema, message);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, writeMessage_1.writeMessage)(message, schema, writer);
        expect(writer.offset).toBe(byteLength);
        const reader = new BufferBinary_1.TestBufferReader(writer.payload);
        expect((0, readMessage_1.default)(reader, context)).toEqual(message);
        expect(reader.offset).toBe(byteLength);
    });
});
