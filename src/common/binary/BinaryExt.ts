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

type RegularOrTypedArray = [] | Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array

function countByteArray(value: RegularOrTypedArray) {
    return value.length + 4
}

function count2ByteArray(value: RegularOrTypedArray) {
    return (value.length * 2) + 4
}

function count4ByteArray(value: RegularOrTypedArray) {
    return (value.length * 4) + 4
}

function count8ByteArray(value: RegularOrTypedArray) {
    return (value.length * 8) + 4
}

const data = {
    //[Binary.UInt8]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },
    //[Binary.Int8]: { bytes: 1, write: 'writeInt8', read: 'readInt8' },
    //[Binary.UInt16]: { bytes: 2, write: 'writeUInt16', read: 'readUInt16' },
    //[Binary.Int16]: { bytes: 2, write: 'writeInt16', read: 'readInt16' },
    //[Binary.UInt32]: { bytes: 4, write: 'writeUInt32', read: 'readUInt32' },
    //[Binary.Int32]: { bytes: 4, write: 'writeInt32', read: 'readInt32' },
    //[Binary.Float32]: { bytes: 4, write: 'writeFloat32', read: 'readFloat32' },
    //[Binary.Float64]: { bytes: 8, write: 'writeFloat64', read: 'readFloat64' },
    //[Binary.Boolean]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },

    //[Binary.String]: { bytes: -1, write: 'writeString', read: 'readString', count: countString },
    //[Binary.UInt8Array]: { bytes: -1, write: 'writeUInt8Array', read: 'readUInt8Array', count: countByteArray },
    //[Binary.Int8Array]: { bytes: -1, write: 'writeInt8Array', read: 'readInt8Array', count: countByteArray },
    //[Binary.UInt16Array]: { bytes: -1, write: 'writeUInt16Array', read: 'readUInt16Array', count: count2ByteArray },
    //[Binary.Int16Array]: { bytes: -1, write: 'writeInt16Array', read: 'readInt16Array', count: count2ByteArray },
    //[Binary.UInt32Array]: { bytes: -1, write: 'writeUInt32Array', read: 'readUInt32Array', count: count4ByteArray },
    //[Binary.Int32Array]: { bytes: -1, write: 'writeInt32Array', read: 'readInt32Array', count: count4ByteArray },
    //[Binary.Float32Array]: { bytes: -1, write: 'writeFloat32Array', read: 'readFloat32Array', count: count8ByteArray },
    //[Binary.Float64Array]: { bytes: -1, write: 'writeFloat64Array', read: 'readFloat64Array', count: count8ByteArray },
}


function registerBinaryType(
    btype: Binary, 
    bytes: number, 
    write: string, 
    read: string, 
    count?: (value: any) => number) {
        // @ts-ignore
        data[btype] = { bytes, write, read, count }       
}


// integers
registerBinaryType(Binary.Boolean, 1,  'writeUInt8', 'readUInt8')
registerBinaryType(Binary.UInt8, 1,  'writeUInt8', 'readUInt8')
registerBinaryType(Binary.Int8, 1,  'writeInt8', 'readInt8')
registerBinaryType(Binary.UInt16, 2,  'writeUInt16', 'readUInt16')
registerBinaryType(Binary.Int16, 2,  'writeInt16', 'readInt16')
registerBinaryType(Binary.UInt32, 4,  'writeUInt32', 'readUInt32')
registerBinaryType(Binary.Int32, 4,  'writeInt32', 'readInt32')

// floats
registerBinaryType(Binary.Float32, 4,  'writeFloat32', 'readFloat32')
registerBinaryType(Binary.Float64, 8,  'writeFloat64', 'readFloat64')

// variable length types
registerBinaryType(Binary.String, -1, 'writeString', 'readString', countString)
registerBinaryType(Binary.UInt8Array, -1, 'writeUInt8Array', 'readUInt8Array', countByteArray)
registerBinaryType(Binary.Int8Array, -1, 'writeInt8Array', 'readInt8Array', countByteArray)
registerBinaryType(Binary.UInt16Array, -1, 'writeUInt16Array', 'readUInt16Array', count2ByteArray)
registerBinaryType(Binary.Int16Array, -1, 'writeInt16Array', 'readInt16Array', count2ByteArray)
registerBinaryType(Binary.UInt32Array, -1, 'writeUInt32Array', 'readUInt32Array', count4ByteArray)
registerBinaryType(Binary.Int32Array, -1, 'writeInt32Array', 'readInt32Array', count4ByteArray)
registerBinaryType(Binary.Float32Array, -1, 'writeFloat32Array', 'readFloat32Array', count8ByteArray)
registerBinaryType(Binary.Float64Array, -1, 'writeFloat64Array', 'readFloat64Array', count8ByteArray)

registerBinaryType(Binary.Vector2, -1, '','', (value: any) => { return 12345 })




export default function (binaryType: Binary) {
    // @ts-ignore
    return data[binaryType]
}