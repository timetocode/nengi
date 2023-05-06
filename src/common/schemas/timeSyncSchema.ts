import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const timeSyncSchema = defineSchema({
    timestamp: Binary.Float64,
})

export { timeSyncSchema }