import { Binary } from './Binary'
import { IBinaryReader } from './IBinaryReader'
import { IBinaryWriter } from './IBinaryWriter'

type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array
type RegularOrTypedArray = [] | TypedArray

/**
 * User definable binary type
 */
export type CustomBinarySpecification<T> = {
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
    let bytes = 0
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i)
        if (code < 0x80) {
            bytes += 1
        } else if (code < 0x800) {
            bytes += 2
        } else if (code >= 0xd800 && code <= 0xdbff) {
            const next = str.charCodeAt(i + 1)
            if (next >= 0xdc00 && next <= 0xdfff) {
                bytes += 4
                i++
            } else {
                // UTF-8 encoders replace an unpaired surrogate with U+FFFD.
                bytes += 3
            }
        } else {
            bytes += 3
        }
    }
    return bytes
}

function countString(value: string): number {
    const length = stringByteLength(value)
    return length + 4
}

const data: Map<Binary, BinarySpecification<any>> = new Map()

/** IDs below this value are reserved for nengi's built-in binary types. */
export const CUSTOM_BINARY_TYPE_START = 1024

const lerp = function (a: number, b: number, t: number) {
    return a + ((b - a) * t)
}

const lerpRot = function (a: number, b: number, t: number) {
    const s = (1 - t) * Math.sin(a) + t * Math.sin(b)
    const c = (1 - t) * Math.cos(a) + t * Math.cos(b)
    return Math.atan2(s, c)
}

/**
 * Register one application-owned ID during shared protocol setup, before schemas.
 * IDs below CUSTOM_BINARY_TYPE_START are reserved; duplicate registrations throw.
 * Both endpoints must use the same ID and encoding. Returns the schema type value.
 */
function declareBinaryType<T>(binaryIndex: number, spec: CustomBinarySpecification<T>): Binary {
    if (!Number.isSafeInteger(binaryIndex) || binaryIndex < CUSTOM_BINARY_TYPE_START) {
        throw new RangeError(`Custom binary type IDs must be safe integers at least ${CUSTOM_BINARY_TYPE_START}; lower IDs are reserved for nengi.`)
    }
    installBinaryType(binaryIndex, spec)
    return binaryIndex as Binary
}

function installBinaryType<T>(binaryIndex: number, spec: CustomBinarySpecification<T>) {
    if (data.has(binaryIndex)) {
        throw new Error(`Binary type ${binaryIndex} is already registered. Register each ID once during shared protocol setup.`)
    }
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('A custom binary type requires a specification object.')
    }
    const { write, read, byteSize, compare, pre, post, interp, clone } = spec

    if (typeof write !== 'function') {
        throw new Error('A custom binary type was declared with no write function. Please declare a function write(value: T, bw: IBinaryWriter) => void that writes your custom binary type to an IBinaryWriter.')
    }
    if (typeof read !== 'function') {
        throw new Error('A custom binary type was declared with no read function. Please declare a function (reader: IBinaryReader) => T that reads your custom binary type from an IBinaryReader.')
    }
    if (typeof byteSize !== 'function') {
        throw new Error('A custom binary type was declared with no byteSize function. Please declare a function byteSize(a: T) => number that returns the byte size of your value.')
    }
    if (typeof compare !== 'function') {
        throw new Error('A custom binary type was declared with no compare function. Please declare a function compare(a: T, b: T) => boolean that can compare two values of your binary type.')
    }
    for (const name of ['pre', 'post', 'interp', 'clone'] as const) {
        if (spec[name] !== undefined && typeof spec[name] !== 'function') {
            throw new TypeError(`Custom binary type ${name} must be a function when provided.`)
        }
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
        // Without interpolation, return the latest value using the type's copy contract.
        interp: interp ?? (clone ? (_a: any, b: any) => clone(b) : (_a: any, b: any) => b),
        clone: (clone) ? clone : (value: any) => { return value }
    })
}

installBinaryType<number>(Binary.UInt8, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt8(value) },
    read: (br: IBinaryReader) => { return br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.Int8, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt8(value) },
    read: (br: IBinaryReader) => { return br.readInt8() },
    byteSize: () => { return 1 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.UInt16, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt16(value) },
    read: (br: IBinaryReader) => { return br.readUInt16() },
    byteSize: () => { return 2 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.Int16, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt16(value) },
    read: (br: IBinaryReader) => { return br.readInt16() },
    byteSize: () => { return 2 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.UInt32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeUInt32(value) },
    read: (br: IBinaryReader) => { return br.readUInt32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.Int32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeInt32(value) },
    read: (br: IBinaryReader) => { return br.readInt32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.Float32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat32(value) },
    read: (br: IBinaryReader) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.Float64, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat64(value) },
    read: (br: IBinaryReader) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerp
})

installBinaryType<number>(Binary.Rotation, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat64(value) },
    read: (br: IBinaryReader) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerpRot
})

installBinaryType<number>(Binary.Rotation32, {
    write: (value: number, bw: IBinaryWriter) => { bw.writeFloat32(value) },
    read: (br: IBinaryReader) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a: number, b: number) => { return a === b },
    interp: lerpRot
})

installBinaryType<string>(Binary.String, {
    write: (value: string, bw: IBinaryWriter) => { bw.writeString(value) },
    read: (br: IBinaryReader) => { return br.readString() },
    byteSize: countString,
    compare: (a: string, b: string) => { return a === b }
})

function compareTypedArray(a: TypedArray, b: TypedArray) {
    if (a.length !== b.length) { return false }
    for (let i = a.length - 1; i >= 0; i -= 1) {
        if ((a[i] !== b[i])) { return false }
    }
    return true
}

installBinaryType<Uint8Array>(Binary.UInt8Array, {
    write: (value: Uint8Array, bw: IBinaryWriter) => { bw.writeUInt8Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray,
    clone: (value: Uint8Array) => new Uint8Array(value)
})

installBinaryType<Int8Array>(Binary.Int8Array, {
    write: (value: Int8Array, bw: IBinaryWriter) => { bw.writeInt8Array(value) },
    read: (br: IBinaryReader) => { return br.readInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray,
    clone: (value: Int8Array) => new Int8Array(value)
})

installBinaryType<Uint16Array>(Binary.UInt16Array, {
    write: (value: Uint16Array, bw: IBinaryWriter) => { bw.writeUInt16Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray,
    clone: (value: Uint16Array) => new Uint16Array(value)
})

installBinaryType<Int16Array>(Binary.Int16Array, {
    write: (value: Int16Array, bw: IBinaryWriter) => { bw.writeInt16Array(value) },
    read: (br: IBinaryReader) => { return br.readInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray,
    clone: (value: Int16Array) => new Int16Array(value)
})

installBinaryType<Uint32Array>(Binary.UInt32Array, {
    write: (value: Uint32Array, bw: IBinaryWriter) => { bw.writeUInt32Array(value) },
    read: (br: IBinaryReader) => { return br.readUInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray,
    clone: (value: Uint32Array) => new Uint32Array(value)
})

installBinaryType<Int32Array>(Binary.Int32Array, {
    write: (value: Int32Array, bw: IBinaryWriter) => { bw.writeInt32Array(value) },
    read: (br: IBinaryReader) => { return br.readInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray,
    clone: (value: Int32Array) => new Int32Array(value)
})

installBinaryType<Float32Array>(Binary.Float32Array, {
    write: (value: Float32Array, bw: IBinaryWriter) => { bw.writeFloat32Array(value) },
    read: (br: IBinaryReader) => { return br.readFloat32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray,
    clone: (value: Float32Array) => new Float32Array(value)
})

installBinaryType<Float64Array>(Binary.Float64Array, {
    write: (value: Float64Array, bw: IBinaryWriter) => { bw.writeFloat64Array(value) },
    read: (br: IBinaryReader) => { return br.readFloat64Array() },
    byteSize: count8ByteArray,
    compare: compareTypedArray,
    clone: (value: Float64Array) => new Float64Array(value)
})

installBinaryType<boolean>(Binary.Boolean, {
    write: (value: any, bw: IBinaryWriter) => { bw.writeUInt8(value ? 1 : 0) },
    read: (br: IBinaryReader) => { return 1 === br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a: boolean, b: boolean) => { return a === b }
})

type Vector2 = { x: number, y: number }

installBinaryType<Vector2>(Binary.Vector2, {
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
    byteSize: () => {
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

installBinaryType<Vector3>(Binary.Vector3, {
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
    byteSize: () => {
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

installBinaryType<Vector4>(Binary.Vector4, {
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
    byteSize: () => {
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
    if (t === 1) {
        Object.assign(out, b)
        return out
    }

    const { x, y, z, w } = a
    let bx = b.x
    let by = b.y
    let bz = b.z
    let bw = b.w

    // based off three.js quat slerp which cites this:
    // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

    let cosHalfTheta = w * bw + x * bx + y * by + z * bz

    if (cosHalfTheta < 0) {
        bw = -bw
        bx = -bx
        by = -by
        bz = -bz
        cosHalfTheta = -cosHalfTheta
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
        out.w = s * w + t * bw
        out.x = s * x + t * bx
        out.y = s * y + t * by
        out.z = s * z + t * bz
        normalizeQuat(out)
        return out
    }

    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta)
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta)
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta

    out.w = (w * ratioA + bw * ratioB)
    out.x = (x * ratioA + bx * ratioB)
    out.y = (y * ratioA + by * ratioB)
    out.z = (z * ratioA + bz * ratioB)

    return out
}

type Quaternion = { x: number, y: number, z: number, w: number }

installBinaryType<Quaternion>(Binary.Quaternion, {
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
    byteSize: () => {
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

export { binaryGet, declareBinaryType, lerp }
