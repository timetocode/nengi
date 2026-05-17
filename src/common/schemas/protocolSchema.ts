import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const protocolSchema = defineMessageSchema({
    nidType: Binary.UInt8,
    ntypeType: Binary.UInt8
})
