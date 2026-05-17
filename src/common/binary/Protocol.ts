import { Binary } from './Binary'
import { IBinaryReader } from './IBinaryReader'
import { IBinaryWriter } from './IBinaryWriter'

type NetworkIdType = Binary.UInt8 | Binary.UInt16 | Binary.UInt32

type ProtocolConfig = {
    nidType: NetworkIdType
    ntypeType: NetworkIdType
}

const DEFAULT_PROTOCOL: ProtocolConfig = {
    nidType: Binary.UInt8,
    ntypeType: Binary.UInt8
}

function maxValueForNetworkType(type: NetworkIdType) {
    if (type === Binary.UInt8) {
        return 0xff
    }
    if (type === Binary.UInt16) {
        return 0xffff
    }
    return 0xffffffff
}

function byteSizeOfNetworkType(type: NetworkIdType) {
    if (type === Binary.UInt8) {
        return 1
    }
    if (type === Binary.UInt16) {
        return 2
    }
    return 4
}

function networkTypeForMaxValue(maxValue: number): NetworkIdType {
    if (maxValue <= maxValueForNetworkType(Binary.UInt8)) {
        return Binary.UInt8
    }
    if (maxValue <= maxValueForNetworkType(Binary.UInt16)) {
        return Binary.UInt16
    }
    return Binary.UInt32
}

function nextNetworkType(type: NetworkIdType): NetworkIdType | null {
    if (type === Binary.UInt8) {
        return Binary.UInt16
    }
    if (type === Binary.UInt16) {
        return Binary.UInt32
    }
    return null
}

function assertNetworkIdType(type: Binary): asserts type is NetworkIdType {
    if (type !== Binary.UInt8 && type !== Binary.UInt16 && type !== Binary.UInt32) {
        throw new Error('Network id type must be UInt8, UInt16, or UInt32.')
    }
}

function writeNetworkId(value: number, type: NetworkIdType, writer: IBinaryWriter) {
    if (type === Binary.UInt8) {
        writer.writeUInt8(value)
        return
    }
    if (type === Binary.UInt16) {
        writer.writeUInt16(value)
        return
    }
    writer.writeUInt32(value)
}

function readNetworkId(type: NetworkIdType, reader: IBinaryReader) {
    if (type === Binary.UInt8) {
        return reader.readUInt8()
    }
    if (type === Binary.UInt16) {
        return reader.readUInt16()
    }
    return reader.readUInt32()
}

export {
    DEFAULT_PROTOCOL,
    NetworkIdType,
    ProtocolConfig,
    assertNetworkIdType,
    byteSizeOfNetworkType,
    maxValueForNetworkType,
    networkTypeForMaxValue,
    nextNetworkType,
    readNetworkId,
    writeNetworkId
}
