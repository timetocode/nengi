import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const pingSchema = defineMessageSchema({
    latency: Binary.UInt16,
    pingId: Binary.UInt16,
    serverTimeMs: Binary.Float64,
})
