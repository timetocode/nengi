"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingSchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.pingSchema = (0, defineSchema_1.defineMessageSchema)({
    latency: Binary_1.Binary.UInt16,
    pingId: Binary_1.Binary.UInt16,
    serverTimeMs: Binary_1.Binary.Float64,
});
