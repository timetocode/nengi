import { Binary } from './Binary'
import { IBinaryReader } from './IBinaryReader'
import { IBinaryWriter } from './IBinaryWriter'

type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array
type RegularOrTypedArray = [] | TypedArray
type SimpleBinarySpecification = { bytes: number, write: string, read: string }
type AdvancedBinarySpecification<T> = {
    write: (value: any, bw: IBinaryWriter) => void,
    read: (br: IBinaryReader) => T,
    byteSize: (value: any) => number,
    compare: (a: T, b: T) => boolean
    pre?: (value: any) => T,
    post?: (value: any) => T,
    interp?: (a: T, b: T, t: number) => T
}
type BinarySpecification = AdvancedBinarySpecification<any>

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


const data: Map<Binary, BinarySpecification> = new Map()
//const data: { [prop: number]: BinarySpecification } = {
    //[Binary.UInt8]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },
    //[Binary.Int8]: { bytes: 1, write: 'writeInt8', read: 'readInt8' },
    //[Binary.UInt16]: { bytes: 2, write: 'writeUInt16', read: 'readUInt16' },
    //[Binary.Int16]: { bytes: 2, write: 'writeInt16', read: 'readInt16' },
    //[Binary.UInt32]: { bytes: 4, write: 'writeUInt32', read: 'readUInt32' },
    //[Binary.Int32]: { bytes: 4, write: 'writeInt32', read: 'readInt32' },
    //[Binary.Float32]: { bytes: 4, write: 'writeFloat32', read: 'readFloat32' },
    //[Binary.Float64]: { bytes: 8, write: 'writeFloat64', read: 'readFloat64' },
    //[Binary.Boolean]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },

    //[Binary.String]: { bytes: -1, write: 'writeString', read: 'readString', byteSize: countString },
    //[Binary.UInt8Array]: { bytes: -1, write: 'writeUInt8Array', read: 'readUInt8Array', byteSize: countByteArray },
    //[Binary.Int8Array]: { bytes: -1, write: 'writeInt8Array', read: 'readInt8Array', byteSize: countByteArray },
    //[Binary.UInt16Array]: { bytes: -1, write: 'writeUInt16Array', read: 'readUInt16Array', byteSize: count2ByteArray },
    //[Binary.Int16Array]: { bytes: -1, write: 'writeInt16Array', read: 'readInt16Array', byteSize: count2ByteArray },
    //[Binary.UInt32Array]: { bytes: -1, write: 'writeUInt32Array', read: 'readUInt32Array', byteSize: count4ByteArray },
    //[Binary.Int32Array]: { bytes: -1, write: 'writeInt32Array', read: 'readInt32Array', byteSize: count4ByteArray },
    //[Binary.Float32Array]: { bytes: -1, write: 'writeFloat32Array', read: 'readFloat32Array', byteSize: count8ByteArray },
    //[Binary.Float64Array]: { bytes: -1, write: 'writeFloat64Array', read: 'readFloat64Array', byteSize: count8ByteArray },
//}
const lerp = function (a: number, b: number, portion: number) {
    return a + ((b - a) * portion)
}

declareCustomBinaryType<number>(Binary.UInt8, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt8(value) },
    read: (br: IBinaryReader) => { return br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.Int8, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt8(value) },
    read: (br: IBinaryReader) => { return br.readInt8() },
    byteSize: () => { return 1 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.UInt16, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt16(value) },
    read: (br: IBinaryReader) => { return br.readUInt16() },
    byteSize: () => { return 2 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.Int16, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt16(value) },
    read: (br: IBinaryReader) => { return br.readInt16() },
    byteSize: () => { return 2 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.UInt32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt32(value) },
    read: (br: IBinaryReader) => { return br.readUInt32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.Int32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt32(value) },
    read: (br: IBinaryReader) => { return br.readInt32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.Float32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat32(value) },
    read: (br: IBinaryReader) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<number>(Binary.Float64, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat64(value) },
    read: (br: IBinaryReader) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareCustomBinaryType<string>(Binary.String, {
    write: (value: string, bw: IBinaryWriter) => { bw.writeString(value) },
    read: (br: IBinaryReader) => { return br.readString() },
    byteSize: countString,
    compare: (a: string, b: string) => { return a === b }
})

function compareTypedArray(a: TypedArray, b: TypedArray) {
    if (a.length !== b.length) { return false }
    for (let i = a.length; -1 < i; i -= 1) {
        if ((a[i] !== b[i])) { return false }
    }
    return true
}

declareCustomBinaryType<Uint8Array>(Binary.UInt8Array, {
    write: (value: Uint8Array, bw: IBinaryWriter) => { bw.writeUInt8Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Int8Array>(Binary.Int8Array, {
    write: (value: Int8Array, bw: IBinaryWriter) => { bw.writeInt8Array(value) },
    read: (br: IBinaryReader) => { return br.readInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Uint16Array>(Binary.UInt16Array, {
    write: (value: Uint16Array, bw: IBinaryWriter) => { bw.writeUInt16Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Int16Array>(Binary.Int16Array, {
    write: (value: Int16Array, bw: IBinaryWriter) => { bw.writeInt16Array(value) },
    read: (br: IBinaryReader) => { return br.readInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Uint32Array>(Binary.UInt32Array, {
    write: (value: Uint32Array, bw: IBinaryWriter) => { bw.writeUInt32Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Int32Array>(Binary.Int32Array, {
    write: (value: Int32Array, bw: IBinaryWriter) => { bw.writeInt32Array(value) },
    read: (br: IBinaryReader) => { return br.readInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Float32Array>(Binary.Float32Array, {
    write: (value: Float32Array, bw: IBinaryWriter) => { bw.writeFloat32Array(value) },
    read: (br: IBinaryReader) => { return br.readFloat32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})

declareCustomBinaryType<Float64Array>(Binary.Float64Array, {
    write: (value: Float64Array, bw: IBinaryWriter) => { bw.writeFloat64Array(value) },
    read: (br: IBinaryReader) => { return br.readFloat64Array() },
    byteSize: count8ByteArray,
    compare: compareTypedArray
})

function declareCustomBinaryType<T>(binaryIndex: number, spec: AdvancedBinarySpecification<T>) {
    const { write, read, byteSize, compare, pre, post, interp } = spec

    if (!write) {
        throw new Error('A custom binary type was declared with no write function. Please declare a function write(value: T, bw: IBinaryWirter) => void that writes your custom binary type to an IBinaryWriter.')
    }
    if (!read) {
        throw new Error('A custom binary type was declared with no read function. Please declare a function (readbr: IBinaryReader) => T that reads your custom binary tpe from an IBinaryReader.')
    }
    if (!byteSize) {
        throw new Error('A custom binary type was declared with no byteSize function. Please declare a function byteSize(a: T) => number that returns the byte size of your value.')
    }
    if (!compare) {
        throw new Error('A custom binary type was declared with no compare function. Please declare a function compare(a: T, b: T) => boolean that can compare two values of your binary type.')
    }

    data.set(binaryIndex, {
        write,
        read,
        byteSize,
        compare,
        // use the pre function or create a function that returns the value unchanged
        pre: (pre) ? pre : (value: any) => { return value },
        // use the post function or create a function that returns the value unchanged
        post: (post) ? post : (value: any) => { return value },
        // use the interp function or create a function that returns the most recent value uninterpolated
        interp: (interp) ? interp : (a: any, b: any, t: number) => { return b }
    })
    /*
    data[binaryIndex] = {
        write,
        read,
        byteSize,
        compare,
        // use the pre function or create a function that returns the value unchanged
        pre: (pre) ? pre : (value: any) => { return value },
        // use the post function or create a function that returns the value unchanged
        post: (post) ? post : (value: any) => { return value },
        // use the interp function or create a function that returns the most recent value uninterpolated
        interp: (interp) ? interp : (a: any, b: any, t: number) => { return b }
    }
    */
}

declareCustomBinaryType<boolean>(Binary.Boolean, {
    write: (value: any, bw: IBinaryWriter) => { bw.writeUInt8(value) },
    read: (br: IBinaryReader) => { return 1 === br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a: boolean, b: boolean) => { return a === b }
})
/*
// example of inventing a Vector3 and other types
enum ExtendedBinary {
    Rotation2PI = 128, // start at a value past nengi's existing types
    Rotation2PIByte,
    Vector3,
    Vector4,
    Quaternion
}

type Vector3 = { x: number, y: number, z: number }

declareCustomBinaryType<Vector3>(ExtendedBinary.Vector3, {
    write: (value: Vector3, bw: IBinaryWriter) => {
        const { x, y, z } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
        bw.writeFloat64(z)
    },
    read: (br: IBinaryReader) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        const z = br.readFloat64()
        return { x, y, z }
    },
    byteSize: (value: Vector3) => {
        return 24 // that's 3 float64s worth of bytes
    },
    interp: (a: any, b: any, t: number) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.x, b.x, t),
            z: lerp(a.x, b.x, t),
        }
    }
})
*/

const binaryGet = function (binaryType: Binary) {
    return data.get(binaryType)!
   // return data[binaryType]
}

//const bb = get(Binary.Boolean)


export { binaryGet, declareCustomBinaryType }