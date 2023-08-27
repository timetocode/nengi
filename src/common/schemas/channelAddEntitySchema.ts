import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const channelAddEntitySchema = defineSchema({
    cid: Binary.UInt16,
    eid: Binary.UInt16,
})