"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpolationDelaySchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.interpolationDelaySchema = (0, defineSchema_1.defineMessageSchema)({
    delayMs: Binary_1.Binary.Float32,
});
