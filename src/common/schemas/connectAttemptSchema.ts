import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionAttemptSchema = defineSchema({
    handshake: Binary.String,
})