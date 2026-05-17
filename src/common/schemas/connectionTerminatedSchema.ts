import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionTerminatedSchema = defineMessageSchema({
    reason: Binary.String,
})
