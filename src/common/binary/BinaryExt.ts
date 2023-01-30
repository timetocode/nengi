import { Binary } from './Binary'


function stringByteLength(str: string): number {
    if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(str, 'utf8')
    } else {
        return new Blob([str]).size
    }
}

function count(value: string): number {
    // TODO need a node 16 way of reading the string length in both browser and node
    // blob might be node17+?
    //const length = Buffer.byteLength(value, 'utf8')
    //const length = new Blob([value]).size
    const length = stringByteLength(value)
    console.log('COUNT invoked', value)
    return length + 4
}

function countUInt8Array(value: Uint8Array): number {
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


    [Binary.String]: { bytes: -1, write: 'writeString', read: 'readString', count },
    [Binary.UInt8Array]: { bytes: -1, write: 'writeUInt8Array', read: 'readUInt8Array', count: countUInt8Array },
}

export default function (binaryType: Binary) {
    return data[binaryType]
}