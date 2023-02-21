import { Binary } from './Binary'

function stringByteLength(str: string): number {
    if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(str, 'utf8')
    } else {
        return new Blob([str]).size
    }
}

function countString(value: string): number {
    const length = stringByteLength(value)
    return length + 4
}

type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array

function countTypedArray(value: TypedArray): number {
    return value.byteLength + 4
}
const data = {
    [Binary.UInt8]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },
    [Binary.Int8]: { bytes: 1, write: 'writeInt8', read: 'readInt8' },
    [Binary.UInt16]: { bytes: 2, write: 'writeUInt16', read: 'readUInt16' },
    [Binary.Int16]: { bytes: 2, write: 'writeInt16', read: 'readInt16' },
    [Binary.UInt32]: { bytes: 4, write: 'writeUInt32', read: 'readUInt32' },
    [Binary.Int32]: { bytes: 4, write: 'writeInt32', read: 'readInt32' },
    [Binary.Float32]: { bytes: 4, write: 'writeFloat32', read: 'readFloat32' },
    [Binary.Float64]: { bytes: 8, write: 'writeFloat64', read: 'readFloat64' },
    [Binary.Boolean]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },

    [Binary.String]: { bytes: -1, write: 'writeString', read: 'readString', count: countString },
    [Binary.UInt8Array]: { bytes: -1, write: 'writeUInt8Array', read: 'readUInt8Array', count: countTypedArray },
    [Binary.Int8Array]: { bytes: -1, write: 'writeInt8Array', read: 'readInt8Array', count: countTypedArray },
    [Binary.UInt16Array]: { bytes: -1, write: 'writeUInt16Array', read: 'readUInt16Array', count: countTypedArray },
    [Binary.Int16Array]: { bytes: -1, write: 'writeInt16Array', read: 'readInt16Array', count: countTypedArray },
    [Binary.UInt32Array]: { bytes: -1, write: 'writeUInt32Array', read: 'readUInt32Array', count: countTypedArray },
    [Binary.Int32Array]: { bytes: -1, write: 'writeInt32Array', read: 'readInt32Array', count: countTypedArray },
    [Binary.Float32Array]: { bytes: -1, write: 'writeFloat32Array', read: 'readFloat32Array', count: countTypedArray },
    [Binary.Float64Array]: { bytes: -1, write: 'writeFloat64Array', read: 'readFloat64Array', count: countTypedArray },
}

export default function (binaryType: Binary) {
    return data[binaryType]
}