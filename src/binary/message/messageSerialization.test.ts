import count from './count'
import readMessage from './readMessage'
import { writeMessage } from './writeMessage'
import { Binary } from '../../common/binary/Binary'
import { defineMessageSchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { TestBufferReader, TestBufferWriter } from '../../testSupport/BufferBinary'

describe('message serialization', () => {
    it('counts, writes, and reads a schema-backed message without a hardcoded nid', () => {
        const schema = defineMessageSchema({
            kind: Binary.UInt8,
            text: Binary.String,
            position: { type: Binary.Vector2, interp: true },
            active: Binary.Boolean
        })

        const context = new Context()
        context.register(7, schema)

        const message = {
            ntype: 7,
            kind: 2,
            text: 'open',
            position: { x: 12.5, y: -4.25 },
            active: true
        }

        const byteLength = count(schema, message)
        const writer = TestBufferWriter.create(byteLength)
        writeMessage(message, schema, writer)

        expect(writer.offset).toBe(byteLength)

        const reader = new TestBufferReader(writer.payload)
        expect(readMessage(reader, context)).toEqual(message)
        expect(reader.offset).toBe(byteLength)
    })
})
