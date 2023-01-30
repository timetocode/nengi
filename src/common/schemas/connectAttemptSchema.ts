import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const connectionAttemptSchema = defineSchema({
    handshake: Binary.String,
})

export { connectionAttemptSchema }