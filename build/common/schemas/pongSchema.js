"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pongSchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.pongSchema = (0, defineSchema_1.defineMessageSchema)({
    pingId: Binary_1.Binary.UInt16,
    serverTimeMs: Binary_1.Binary.Float64,
    clientReceiveTimeMs: Binary_1.Binary.Float64,
    clientSendTimeMs: Binary_1.Binary.Float64,
});
