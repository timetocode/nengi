'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.declareBinaryType = exports.binaryGet = void 0
const Binary_1 = require('./Binary')
function countByteArray(value) {
    return value.length + 4
}
function count2ByteArray(value) {
    return (value.length * 2) + 4
}
function count4ByteArray(value) {
    return (value.length * 4) + 4
}
function count8ByteArray(value) {
    return (value.length * 8) + 4
}
function stringByteLength(str) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(str, 'utf8')
    }
    else {
        return new Blob([str]).size
    }
}
function countString(value) {
    const length = stringByteLength(value)
    return length + 4
}
const data = new Map()
const lerp = function (a, b, t) {
    return a + ((b - a) * t)
}
const lerpRot = function (a, b, t) {
    const s = (1 - t) * Math.sin(a) + t * Math.sin(b)
    const c = (1 - t) * Math.cos(a) + t * Math.cos(b)
    return Math.atan2(s, c)
}
function declareBinaryType(binaryIndex, spec) {
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
        pre: (pre) ? pre : (value) => { return value },
        // use the post function or create a function that returns the value unchanged
        post: (post) ? post : (value) => { return value },
        // use the interp function or create a function that returns the most recent value uninterpolated
        interp: (interp) ? interp : (a, b, t) => { return b },
        clone: (clone) ? clone : (value) => { return value }
    })
}
exports.declareBinaryType = declareBinaryType
declareBinaryType(Binary_1.Binary.UInt8, {
    write: (value, bw) => { bw.writeUInt8(value) },
    read: (br) => { return br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.Int8, {
    write: (value, bw) => { bw.writeInt8(value) },
    read: (br) => { return br.readInt8() },
    byteSize: () => { return 1 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.UInt16, {
    write: (value, bw) => { bw.writeUInt16(value) },
    read: (br) => { return br.readUInt16() },
    byteSize: () => { return 2 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.Int16, {
    write: (value, bw) => { bw.writeInt16(value) },
    read: (br) => { return br.readInt16() },
    byteSize: () => { return 2 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.UInt32, {
    write: (value, bw) => { bw.writeUInt32(value) },
    read: (br) => { return br.readUInt32() },
    byteSize: () => { return 4 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.Int32, {
    write: (value, bw) => { bw.writeInt32(value) },
    read: (br) => { return br.readInt32() },
    byteSize: () => { return 4 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.Float32, {
    write: (value, bw) => { bw.writeFloat32(value) },
    read: (br) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.Float64, {
    write: (value, bw) => { bw.writeFloat64(value) },
    read: (br) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a, b) => { return a === b },
    interp: lerp
})
declareBinaryType(Binary_1.Binary.Rotation, {
    write: (value, bw) => { bw.writeFloat64(value) },
    read: (br) => { return br.readFloat64() },
    byteSize: () => { return 8 },
    compare: (a, b) => { return a === b },
    interp: lerpRot
})
declareBinaryType(Binary_1.Binary.Rotation32, {
    write: (value, bw) => { bw.writeFloat32(value) },
    read: (br) => { return br.readFloat32() },
    byteSize: () => { return 4 },
    compare: (a, b) => { return a === b },
    interp: lerpRot
})
declareBinaryType(Binary_1.Binary.String, {
    write: (value, bw) => { bw.writeString(value) },
    read: (br) => { return br.readString() },
    byteSize: countString,
    compare: (a, b) => { return a === b }
})
function compareTypedArray(a, b) {
    if (a.length !== b.length) {
        return false
    }
    for (let i = a.length; -1 < i; i -= 1) {
        if ((a[i] !== b[i])) {
            return false
        }
    }
    return true
}
declareBinaryType(Binary_1.Binary.UInt8Array, {
    write: (value, bw) => { bw.writeUInt8Array(value) },
    read: (br) => { return br.readUInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.Int8Array, {
    write: (value, bw) => { bw.writeInt8Array(value) },
    read: (br) => { return br.readInt8Array() },
    byteSize: countByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.UInt16Array, {
    write: (value, bw) => { bw.writeUInt16Array(value) },
    read: (br) => { return br.readUInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.Int16Array, {
    write: (value, bw) => { bw.writeInt16Array(value) },
    read: (br) => { return br.readInt16Array() },
    byteSize: count2ByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.UInt32Array, {
    write: (value, bw) => { bw.writeUInt32Array(value) },
    read: (br) => { return br.readUInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.Int32Array, {
    write: (value, bw) => { bw.writeInt32Array(value) },
    read: (br) => { return br.readInt32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.Float32Array, {
    write: (value, bw) => { bw.writeFloat32Array(value) },
    read: (br) => { return br.readFloat32Array() },
    byteSize: count4ByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.Float64Array, {
    write: (value, bw) => { bw.writeFloat64Array(value) },
    read: (br) => { return br.readFloat64Array() },
    byteSize: count8ByteArray,
    compare: compareTypedArray
})
declareBinaryType(Binary_1.Binary.Boolean, {
    write: (value, bw) => { bw.writeUInt8(value) },
    read: (br) => { return 1 === br.readUInt8() },
    byteSize: () => { return 1 },
    compare: (a, b) => { return a === b }
})
declareBinaryType(Binary_1.Binary.Vector2, {
    write: (value, bw) => {
        const { x, y } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
    },
    read: (br) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        return { x, y }
    },
    byteSize: (value) => {
        return 16 // that's 2 float64s worth of bytes
    },
    compare(a, b) {
        return (a.x === b.x) && (a.y === b.y)
    },
    interp: (a, b, t) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
        }
    },
    clone: (value) => {
        const { x, y } = value
        return { x, y }
    }
})
declareBinaryType(Binary_1.Binary.Vector3, {
    write: (value, bw) => {
        const { x, y, z } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
        bw.writeFloat64(z)
    },
    read: (br) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        const z = br.readFloat64()
        return { x, y, z }
    },
    byteSize: (value) => {
        return 24 // that's 3 float64s worth of bytes
    },
    compare(a, b) {
        return (a.x === b.x) && (a.y === b.y) && (a.z === b.z)
    },
    interp: (a, b, t) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
            z: lerp(a.z, b.z, t),
        }
    },
    clone: (value) => {
        const { x, y, z } = value
        return { x, y, z }
    }
})
declareBinaryType(Binary_1.Binary.Vector4, {
    write: (value, bw) => {
        const { x, y, z, w } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
        bw.writeFloat64(z)
        bw.writeFloat64(w)
    },
    read: (br) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        const z = br.readFloat64()
        const w = br.readFloat64()
        return { x, y, z, w }
    },
    byteSize: (value) => {
        return 32 // that's 4 float64s worth of bytes
    },
    compare(a, b) {
        return (a.x === b.x) && (a.y === b.y) && (a.z === b.z) && (a.w === b.w)
    },
    interp: (a, b, t) => {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
            z: lerp(a.z, b.z, t),
            w: lerp(a.w, b.w, t)
        }
    },
    clone: (value) => {
        const { x, y, z, w } = value
        return { x, y, z, w }
    }
})
function normalizeQuat(a) {
    let l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w)
    if (l === 0) {
        a.x = 0
        a.y = 0
        a.z = 0
        a.w = 1
    }
    else {
        l = 1 / l
        a.x = a.x * l
        a.y = a.y * l
        a.z = a.z * l
        a.w = a.w * l
    }
}
function quatSlerp(a, b, t) {
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
    }
    else {
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
declareBinaryType(Binary_1.Binary.Quaternion, {
    write: (value, bw) => {
        const { x, y, z, w } = value
        bw.writeFloat64(x)
        bw.writeFloat64(y)
        bw.writeFloat64(z)
        bw.writeFloat64(w)
    },
    read: (br) => {
        const x = br.readFloat64()
        const y = br.readFloat64()
        const z = br.readFloat64()
        const w = br.readFloat64()
        return { x, y, z, w }
    },
    byteSize: (value) => {
        return 32 // that's 4 float64s worth of bytes
    },
    compare(a, b) {
        return (a.x === b.x) && (a.y === b.y) && (a.z === b.z) && (a.w === b.w)
    },
    interp: quatSlerp,
    clone: (value) => {
        const { x, y, z, w } = value
        return { x, y, z, w }
    }
})
const binaryGet = function (binaryType) {
    const b = data.get(binaryType)
    if (!b) {
        throw new Error('Unknown binaryType used.')
    }
    return b
}
exports.binaryGet = binaryGet
//# sourceMappingURL=BinaryExt.js.map