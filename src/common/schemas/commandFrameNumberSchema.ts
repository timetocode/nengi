import { defineMessageSchema } from '../binary/schema/defineSchema'
import { Binary } from '../binary/Binary'

export const commandFrameNumberSchema = defineMessageSchema({
    commandFrameNumber: Binary.UInt32,
})
