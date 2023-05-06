"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeSyncSchema = void 0;
const defineSchema_1 = require("../binary/schema/defineSchema");
const Binary_1 = require("../binary/Binary");
const timeSyncSchema = (0, defineSchema_1.defineSchema)({
    timestamp: Binary_1.Binary.Float64,
});
exports.timeSyncSchema = timeSyncSchema;
//# sourceMappingURL=timeSyncSchema.js.map