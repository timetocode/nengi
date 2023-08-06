'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.clientTickSchema = void 0
const defineSchema_1 = require('../binary/schema/defineSchema')
const Binary_1 = require('../binary/Binary')
const clientTickSchema = (0, defineSchema_1.defineSchema)({
    tick: Binary_1.Binary.UInt16,
})
exports.clientTickSchema = clientTickSchema
//# sourceMappingURL=clientTickSchema.js.map