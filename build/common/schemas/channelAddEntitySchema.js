"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelAddEntitySchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.channelAddEntitySchema = (0, defineSchema_1.defineSchema)({
    cid: Binary_1.Binary.UInt16,
    eid: Binary_1.Binary.UInt16,
});
