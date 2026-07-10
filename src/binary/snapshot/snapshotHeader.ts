import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { WIRE_PROTOCOL_VERSION } from '../../common/binary/Protocol'

export const SNAPSHOT_HEADER_MAGIC = 0x4e
export const SNAPSHOT_HEADER_VERSION = WIRE_PROTOCOL_VERSION
export const SNAPSHOT_HEADER_BYTES = 10

export function writeSnapshotHeader(serverTimeMs: number, writer: IBinaryWriter) {
    writer.writeUInt8(SNAPSHOT_HEADER_MAGIC)
    writer.writeUInt8(SNAPSHOT_HEADER_VERSION)
    writer.writeFloat64(serverTimeMs)
}

export function readSnapshotHeader(reader: IBinaryReader) {
    const magic = reader.readUInt8()
    const version = reader.readUInt8()
    if (magic !== SNAPSHOT_HEADER_MAGIC || version !== SNAPSHOT_HEADER_VERSION) {
        throw new Error(`Unsupported nengi snapshot header (magic=${magic}, version=${version})`)
    }
    const serverTimeMs = reader.readFloat64()
    if (!Number.isFinite(serverTimeMs)) {
        throw new Error('Invalid nengi snapshot server time')
    }
    return serverTimeMs
}
