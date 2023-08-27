import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const pingSchema = defineSchema({
    latency: Binary.UInt16,
})