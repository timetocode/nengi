import { Binary } from './Binary'
import { IBinaryReader } from './IBinaryReader'
import { IBinaryWriter } from './IBinaryWriter'

type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array
type RegularOrTypedArray = [] | TypedArray

/**
 * User definable binary type
 */
type CustomBinarySpecification<T> = {
    write: (value: any, bw: IBinaryWriter) => void,
    read: (br: IBinaryReader) => T,
    byteSize: (value: any) => number,
    compare: (a: T, b: T) => boolean
    pre?: (value: any) => T,
    post?: (value: any) => T,
    interp?: (a: T, b: T, t: number) => T,
    clone?: (value: any) => T
}

/**
 * Engine's version of a binary specification
 * this has all of the functions filled in
 * unlike the CustomBinarySpecification where
 * some are optional
 */
type BinarySpecification<T> = {
    write: (value: any, bw: IBinaryWriter) => void,
    read: (br: IBinaryReader) => T,
    byteSize: (value: any) => number,
    compare: (a: T, b: T) => boolean
    pre: (value: any) => T,
    post: (value: any) => T,
    interp: (a: T, b: T, t: number) => T,
    clone: (value: any) => T
}

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

const data: Map<Binary, BinarySpecification<any>> = new Map()

const lerp = function (a: number, b: number, t: number) {
    return a + ((b - a) * t)
}

const lerpRot = function (a: number, b: number, t: number) {
    const s = (1 - t) * Math.sin(a) + t * Math.sin(b)
    const c = (1 - t) * Math.cos(a) + t * Math.cos(b)
    return Math.atan2(s, c)
}

function declareBinaryType<T>(binaryIndex: number, spec: CustomBinarySpecification<T>) {
    const { write, read, byteSize, compare, pre, post, interp, clone } = spec

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
        interp: (interp) ? interp : (a: any, b: any, t: number) => { return b },
        clone: (clone) ? clone : (value: any) => { return value }
    })
}

declareBinaryType<number>(Binary.UInt8, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt8(value) },
    read: (br: IBinaryReader) => { return br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.Int8, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt8(value) },
    read: (br: IBinaryReader) => { return br.readInt8() },
    byteSize: () => { return 1 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.UInt16, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt16(value) },
    read: (br: IBinaryReader) => { return br.readUInt16() },
    byteSize: () => { return 2 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.Int16, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt16(value) },
    read: (br: IBinaryReader) => { return br.readInt16() },
    byteSize: () => { return 2 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.UInt32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt32(value) },
    read: (br: IBinaryReader) => { return br.readUInt32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.Int32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt32(value) },
    read: (br: IBinaryReader) => { return br.readInt32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.Float32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat32(value) },
    read: (br: IBinaryReader) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.Float64, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat64(value) },
    read: (br: IBinaryReader) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

declareBinaryType<number>(Binary.Rotation, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat64(value) },
    read: (br: IBinaryReader) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerpRot
})

declareBinaryType<number>(Binary.Rotation32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat32(value) },
    read: (br: IBinaryReader) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerpRot
})

declareBinaryType<string>(Binary.String, {
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

declareBinaryType<Uint8Array>(Binary.UInt8Array, {
    write: (value: Uint8Array, bw: IBinaryWriter) => { bw.writeUInt8Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray
})

declareBinaryType<Int8Array>(Binary.Int8Array, {
    write: (value: Int8Array, bw: IBinaryWriter) => { bw.writeInt8Array(value) },
    read: (br: IBinaryReader) => { return br.readInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray
})

declareBinaryType<Uint16Array>(Binary.UInt16Array, {
    write: (value: Uint16Array, bw: IBinaryWriter) => { bw.writeUInt16Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray
})

declareBinaryType<Int16Array>(Binary.Int16Array, {
    write: (value: Int16Array, bw: IBinaryWriter) => { bw.writeInt16Array(value) },
    read: (br: IBinaryReader) => { return br.readInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray
})

declareBinaryType<Uint32Array>(Binary.UInt32Array, {
    write: (value: Uint32Array, bw: IBinaryWriter) => { bw.writeUInt32Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})

declareBinaryType<Int32Array>(Binary.Int32Array, {
    write: (value: Int32Array, bw: IBinaryWriter) => { bw.writeInt32Array(value) },
    read: (br: IBinaryReader) => { return br.readInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})

declareBinaryType<Float32Array>(Binary.Float32Array, {
    write: (value: Float32Array, bw: IBinaryWriter) => { bw.writeFloat32Array(value) },
    read: (br: IBinaryReader) => { return br.readFloat32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})

declareBinaryType<Float64Array>(Binary.Float64Array, {
    write: (value: Float64Array, bw: IBinaryWriter) => { bw.writeFloat64Array(value) },
    read: (br: IBinaryReader) => { return br.readFloat64Array() },
    byteSize: count8ByteArray,
    compare: compareTypedArray
})

declareBinaryType<boolean>(Binary.Boolean, {
    write: (value: any, bw: IBinaryWriter) => { bw.writeUInt8(value) },
    read: (br: IBinaryReader) => { return 1 === br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a: boolean, b: boolean) => { return a === b }
})

type Vector2 = { x: number, y: number }

declareBinaryType<Vector2>(Binary.Vector2, {
    write: (value: Vector2, bw: IBinaryWriter) => {
        const { x, y } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
    },
    read: (br: IBinaryReader) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        return { x, y }
    },
    byteSize: (value: Vector2) => {
        return 16 // that's 2 float64s worth of bytes
    },
    compare(a: Vector2, b: Vector2) {
        return (a.x === b.x) && (a.y === b.y)
    },
    interp: (a: any, b: any, t: number) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
        }
    },
    clone: (value: Vector2) => {
        const { x, y } = value
        return { x, y }
    }
})


type Vector3 = { x: number, y: number, z: number }

declareBinaryType<Vector3>(Binary.Vector3, {
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
    compare(a: Vector3, b: Vector3) {
        return (a.x === b.x) && (a.y === b.y) && (a.z === b.z)
    },
    interp: (a: any, b: any, t: number) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
            z: lerp(a.z, b.z, t),
        }
    },
    clone: (value: Vector3) => {
        const { x, y, z } = value
        return { x, y, z }
    }
})

type Vector4 = { x: number, y: number, z: number, w: number }

declareBinaryType<Vector4>(Binary.Vector4, {
    write: (value: Vector4, bw: IBinaryWriter) => {
        const { x, y, z, w } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
        bw.writeFloat64(z)
        bw.writeFloat64(w)
    },
    read: (br: IBinaryReader) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        const z = br.readFloat64()
        const w = br.readFloat64()
        return { x, y, z, w }
    },
    byteSize: (value: Vector4) => {
        return 32 // that's 4 float64s worth of bytes
    },
    compare(a: Vector4, b: Vector4) {
        return (a.x === b.x) && (a.y === b.y) && (a.z === b.z) && (a.w === b.w)
    },
    interp: (a: any, b: any, t: number) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
            z: lerp(a.z, b.z, t),
            w: lerp(a.w, b.w, t)
        }
    },
    clone: (value: Vector4) => {
        const { x, y, z, w } = value
        return { x, y, z, w }
    }
})

function normalizeQuat(a: Quaternion) {
    let l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w)

    if (l === 0) {
        a.x = 0
        a.y = 0
        a.z = 0
        a.w = 1
    } else {
        l = 1 / l
        a.x = a.x * l
        a.y = a.y * l
        a.z = a.z * l
        a.w = a.w * l
    }
}

function quatSlerp(a: Quaternion, b: Quaternion, t: number) {
    const out = { x: 0, y: 0, z: 0, w: 0 }

    if (t === 0) {
        Object.assign(out, a)
        return out
    }
    if (t === 0) {
        Object.assign(out, b)
        return out
    }

    const { x, y, z, w } = a

    // based off three.js quat slerp which cites this:
    // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

    let cosHalfTheta = w * b.w + x * b.x + y * b.y + z * b.z

    if (cosHalfTheta < 0) {
        out.w = -b.w
        out.x = -b.x
        out.y = -b.y
        out.z = -b.z
        cosHalfTheta = -cosHalfTheta
    } else {
        return { x: b.x, y: b.y, z: b.z, w: b.w }
    }

    if (cosHalfTheta >= 1.0) {
        out.w = w
        out.x = x
        out.y = y
        out.z = z
        return out
    }

    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta

    if (sqrSinHalfTheta <= Number.EPSILON) {
        const s = 1 - t
        out.w = s * w + t * a.w
        out.x = s * x + t * a.x
        out.y = s * y + t * a.y
        out.z = s * z + t * a.z
        normalizeQuat(out)
        return out
    }

    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta)
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta)
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta

    out.w = (w * ratioA + a.w * ratioB)
    out.x = (x * ratioA + a.x * ratioB)
    out.y = (y * ratioA + a.y * ratioB)
    out.z = (z * ratioA + a.z * ratioB)

    return out
}

type Quaternion = { x: number, y: number, z: number, w: number }

declareBinaryType<Quaternion>(Binary.Quaternion, {
    write: (value: Quaternion, bw: IBinaryWriter) => {
        const { x, y, z, w } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
        bw.writeFloat64(z)
        bw.writeFloat64(w)
    },
    read: (br: IBinaryReader) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        const z = br.readFloat64()
        const w = br.readFloat64()
        return { x, y, z, w }
    },
    byteSize: (value: Quaternion) => {
        return 32 // that's 4 float64s worth of bytes
    },
    compare(a: Quaternion, b: Quaternion) {
        return (a.x === b.x) && (a.y === b.y) && (a.z === b.z) && (a.w === b.w)
    },
    interp: quatSlerp,
    clone: (value: Quaternion) => {
        const { x, y, z, w } = value
        return { x, y, z, w }
    }
})

const binaryGet = function (binaryType: Binary) {
    const b = data.get(binaryType)
    if (!b) {
        throw new Error('Unknown binaryType used.')
    }
    return b
}

export { binaryGet, declareBinaryType }