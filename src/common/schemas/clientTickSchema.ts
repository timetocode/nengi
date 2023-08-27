import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const clientTickSchema = defineSchema({
    tick: Binary.UInt16,
})