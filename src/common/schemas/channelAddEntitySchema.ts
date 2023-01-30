import { defineSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

const channelAddEntitySchema = defineSchema({
    cid: Binary.UInt16,
    eid: Binary.UInt16,
})

export { channelAddEntitySchema }