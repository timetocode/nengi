import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const timeSyncSchema = defineMessageSchema({
    timestamp: Binary.Float64,
})
