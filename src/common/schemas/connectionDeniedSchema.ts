import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const connectionDeniedSchema = defineSchema({
   // handshake: Binary.String,
})

export { connectionDeniedSchema}