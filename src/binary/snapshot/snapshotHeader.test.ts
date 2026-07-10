import { TestBufferWriter, testBinaryAdapter } from '../../testSupport/BufferBinary'
import {
    readSnapshotHeader,
    SNAPSHOT_HEADER_BYTES,
    writeSnapshotHeader
} from './snapshotHeader'

describe('snapshot header', () => {
    it('round-trips the versioned server timestamp', () => {
        const writer = TestBufferWriter.create(SNAPSHOT_HEADER_BYTES)
        writeSnapshotHeader(1234.5, writer)

        expect(writer.offset).toBe(SNAPSHOT_HEADER_BYTES)
        expect(readSnapshotHeader(testBinaryAdapter.createReader(writer.buffer))).toBe(1234.5)
    })

    it('rejects an unversioned snapshot header', () => {
        const writer = TestBufferWriter.create(8)
        writer.writeFloat64(1234.5)

        expect(() => readSnapshotHeader(testBinaryAdapter.createReader(writer.buffer)))
            .toThrow('Unsupported nengi snapshot header')
    })
})
