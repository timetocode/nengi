import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const pongSchema = defineMessageSchema({
    pingId: Binary.UInt16,
    serverTimeMs: Binary.Float64,
    clientReceiveTimeMs: Binary.Float64,
    clientSendTimeMs: Binary.Float64,
})
