import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionDeniedSchema = defineMessageSchema({
    // reason: Binary.String,
})
