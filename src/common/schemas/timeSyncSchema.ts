import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const timeSyncSchema = defineSchema({
    timestamp: Binary.Float64,
})