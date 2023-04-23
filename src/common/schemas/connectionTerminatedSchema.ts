import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const connectionTerminatedSchema = defineSchema({
    reason: Binary.String,
})

export { connectionTerminatedSchema }