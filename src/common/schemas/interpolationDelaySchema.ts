import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const interpolationDelaySchema = defineMessageSchema({
    delayMs: Binary.Float32,
})
