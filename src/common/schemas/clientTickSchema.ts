import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const clientTickSchema = defineMessageSchema({
    tick: Binary.UInt16,
})
