import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const connectionAcceptedSchema = defineSchema({
   // handshake: Binary.String,
})

export { connectionAcceptedSchema}