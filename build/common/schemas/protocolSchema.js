"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protocolSchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.protocolSchema = (0, defineSchema_1.defineMessageSchema)({
    nidType: Binary_1.Binary.UInt8,
    ntypeType: Binary_1.Binary.UInt8
});
