import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const clientTickSchema = defineSchema({
    tick: Binary.UInt16,
})

export { clientTickSchema }