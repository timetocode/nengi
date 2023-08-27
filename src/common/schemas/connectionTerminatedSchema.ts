import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionTerminatedSchema = defineSchema({
    reason: Binary.String,
})