import { Buffer } from 'buffer'
import countDiff from './countDiff'
import countUpdateGroup from './countUpdateGroup'
import readDiff from './readDiff'
import readUpdateGroup from './readUpdateGroup'
import writeDiff from './writeDiff'
import writeUpdateGroup from './writeUpdateGroup'
import { Binary } from '../../common/binary/Binary'
import { declareBinaryType } from '../../common/binary/BinaryExt'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { EntityUpdateGroup } from '../../common/binary/schema/util'
import { Context } from '../../common/Context'
import { TestBufferReader, TestBufferWriter } from '../../testSupport/BufferBinary'

const CustomBinary = 200 as Binary

declareBinaryType(CustomBinary, {
    write: (value: string, writer) => writer.writeString(value.toLowerCase()),
    read: reader => reader.readString(),
    byteSize: (value: string) => 4 + Buffer.byteLength(value.toLowerCase(), 'utf8'),
    compare: (a: string, b: string) => a === b,
    post: (value: string) => value.toUpperCase(),
    clone: (value: string) => value
})

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

    it('applies binary post-processing when reading property diffs', () => {
        const schema = defineEntitySchema({
            code: CustomBinary
        })
        const context = new Context()
        context.register(4, schema)
        const ntypes = new Map<number, number>([[42, 4]])
        const diff = {
            nid: 42,
            nschema: schema,
            prop: 'code',
            value: 'ready'
        }

        const byteLength = countDiff(diff, schema)
        const writer = TestBufferWriter.create(byteLength)
        writeDiff(diff.nid, diff, schema, writer)
        const reader = new TestBufferReader(writer.payload)

        expect(readDiff(reader, context, ntypes)).toEqual({
            nid: 42,
            prop: 'code',
            value: 'READY'
        })
    })

    it('applies binary post-processing when reading grouped updates', () => {
        const schema = defineEntitySchema({
            code: CustomBinary,
            other: CustomBinary,
            $options: {
                updateGroups: {
                    pair: ['code', 'other']
                }
            }
        })
        const context = new Context()
        context.register(5, schema)
        const ntypes = new Map<number, number>([[42, 5]])
        const update: EntityUpdateGroup = {
            nid: 42,
            nschema: schema,
            group: schema.updateGroups[0],
            values: ['ready', 'go']
        }

        const byteLength = countUpdateGroup(update)
        const writer = TestBufferWriter.create(byteLength)
        writeUpdateGroup(update, writer)
        const reader = new TestBufferReader(writer.payload)

        expect(readUpdateGroup(reader, context, ntypes)).toEqual([
            { nid: 42, prop: 'code', value: 'READY' },
            { nid: 42, prop: 'other', value: 'GO' }
        ])
    })
})
