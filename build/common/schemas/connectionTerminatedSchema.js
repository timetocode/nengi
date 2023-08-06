'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.connectionTerminatedSchema = void 0
const defineSchema_1 = require('../binary/schema/defineSchema')
const Binary_1 = require('../binary/Binary')
const connectionTerminatedSchema = (0, defineSchema_1.defineSchema)({
    reason: Binary_1.Binary.String,
})
exports.connectionTerminatedSchema = connectionTerminatedSchema
//# sourceMappingURL=connectionTerminatedSchema.js.map