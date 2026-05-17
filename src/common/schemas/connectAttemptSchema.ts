import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionAttemptSchema = defineMessageSchema({
    handshake: Binary.String,
})
