import { Buffer } from 'buffer'
import { Binary } from '../../common/binary/Binary'
import { definePayloadSchema } from '../../common/binary/schema/defineSchema'
import { TestBufferReader, TestBufferWriter } from '../../testSupport/BufferBinary'
import {
    countEndpointPayload,
    createEndpointPayload,
    readSizedEndpointPayload,
    skipEndpointPayload,
    writeEndpointPayload
} from './EndpointPayload'

describe('endpoint payload serialization', () => {
    it('reads a JSON payload only when the declared byte length matches exactly', () => {
        const payload = createEndpointPayload({ ok: true })
        const byteLength = countEndpointPayload(payload)
        const writer = TestBufferWriter.create(byteLength)
        writeEndpointPayload(payload, writer)

        const reader = new TestBufferReader(writer.payload)
        expect(readSizedEndpointPayload(reader, byteLength)).toEqual({ ok: true })
        expect(reader.offset).toBe(byteLength)
    })

    it('reads a schema payload only when the declared byte length matches exactly', () => {
        const schema = definePayloadSchema({
            amount: Binary.UInt16,
            label: Binary.String
        })
        const payload = createEndpointPayload({ amount: 12, label: 'ore' }, schema)
        const byteLength = countEndpointPayload(payload)
        const writer = TestBufferWriter.create(byteLength)
        writeEndpointPayload(payload, writer)

        const reader = new TestBufferReader(writer.payload)
        expect(readSizedEndpointPayload(reader, byteLength, schema)).toEqual({ amount: 12, label: 'ore' })
        expect(reader.offset).toBe(byteLength)
    })

    it('rejects endpoint payload lengths that skip beyond the packet', () => {
        const reader = new TestBufferReader(Buffer.alloc(4))

        expect(() => skipEndpointPayload(reader, 5)).toThrow('exceeds the remaining packet bytes')
        expect(reader.offset).toBe(0)
    })

    it('rejects endpoint payloads that consume fewer bytes than declared', () => {
        const payload = createEndpointPayload({ ok: true })
        const byteLength = countEndpointPayload(payload)
        const writer = TestBufferWriter.create(byteLength + 1)
        writeEndpointPayload(payload, writer)
        writer.writeUInt8(0)

        const reader = new TestBufferReader(writer.payload)
        expect(() => readSizedEndpointPayload(reader, byteLength + 1)).toThrow('fewer bytes')
    })

    it('rejects endpoint payloads that consume more bytes than declared', () => {
        const payload = createEndpointPayload({ ok: true })
        const byteLength = countEndpointPayload(payload)
        const writer = TestBufferWriter.create(byteLength)
        writeEndpointPayload(payload, writer)

        const reader = new TestBufferReader(writer.payload)
        expect(() => readSizedEndpointPayload(reader, byteLength - 1)).toThrow('more bytes')
    })
})
