"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandTimingSchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.commandTimingSchema = (0, defineSchema_1.defineMessageSchema)({
    commandIndex: Binary_1.Binary.UInt8,
    clientTimeMs: Binary_1.Binary.Float64,
    renderDelayMs: Binary_1.Binary.Float32,
    viewTick: Binary_1.Binary.Float32,
    viewServerTimeMs: Binary_1.Binary.Float64,
});
