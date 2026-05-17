import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const channelAddEntitySchema = defineMessageSchema({
    cid: Binary.UInt16,
    eid: Binary.UInt16,
})
