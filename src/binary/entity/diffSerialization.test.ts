import countDiff from './countDiff'
import readDiff from './readDiff'
import writeDiff from './writeDiff'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { TestBufferReader, TestBufferWriter } from '../../testSupport/BufferBinary'

describe('entity diff serialization', () => {
    it('counts, writes, and reads a property diff using the schema property key', () => {
        const schema = defineEntitySchema({
            x: Binary.Float64,
            label: Binary.String
        })

        const context = new Context()
        context.register(3, schema)

        const ntypes = new Map<number, number>([[42, 3]])
        const diff = {
            nid: 42,
            nschema: schema,
            prop: 'label',
            value: 'armed'
        }

        const byteLength = countDiff(diff, schema)
        const writer = TestBufferWriter.create(byteLength)
        writeDiff(diff.nid, diff, schema, writer)

        expect(writer.offset).toBe(byteLength)

        const reader = new TestBufferReader(writer.payload)
        expect(readDiff(reader, context, ntypes)).toEqual({
            nid: 42,
            prop: 'label',
            value: 'armed'
        })
        expect(reader.offset).toBe(byteLength)
    })
})
