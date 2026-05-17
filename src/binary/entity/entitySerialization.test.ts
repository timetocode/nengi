import countEntity from './countEntity'
import readEntity from './readEntity'
import { writeEntity } from './writeEntity'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { TestBufferReader, TestBufferWriter } from '../../testSupport/BufferBinary'

describe('entity serialization', () => {
    it('counts, writes, and reads entity envelope ids separately from schema props', () => {
        const schema = defineEntitySchema({
            x: Binary.Float64,
            label: Binary.String
        })
        const context = new Context()
        context.register(7, schema)

        const entity = {
            ntype: 7,
            nid: 33,
            x: 12.5,
            label: 'door'
        }

        const byteLength = countEntity(schema, entity, Binary.UInt8, Binary.UInt8)
        const writer = TestBufferWriter.create(byteLength)
        writeEntity(entity, schema, writer, Binary.UInt8, Binary.UInt8)

        expect(writer.offset).toBe(byteLength)

        const reader = new TestBufferReader(writer.payload)
        expect(readEntity(reader, context, Binary.UInt8, Binary.UInt8)).toEqual(entity)
        expect(reader.offset).toBe(byteLength)
    })
})
