import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const connectionAcceptedSchema = defineMessageSchema({
    wireProtocolVersion: Binary.UInt16,
})
