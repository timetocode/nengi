"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionAttemptSchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
exports.connectionAttemptSchema = (0, defineSchema_1.defineSchema)({
    handshake: Binary_1.Binary.String,
});
