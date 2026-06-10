import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const commandTimingSchema = defineMessageSchema({
    commandIndex: Binary.UInt8,
    clientTimeMs: Binary.Float64,
    renderDelayMs: Binary.Float32,
    viewTick: Binary.Float32,
    viewServerTimeMs: Binary.Float64,
})
