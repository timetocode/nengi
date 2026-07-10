import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionAttemptSchema = defineMessageSchema({
    wireProtocolVersion: Binary.UInt16,
    handshake: Binary.String,
    schemaFingerprint: Binary.String,
})
