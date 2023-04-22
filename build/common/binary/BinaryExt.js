"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.declareCustomBinaryType = exports.binaryGet = void 0;
const Binary_1 = require("./Binary");
function countByteArray(value) {
    return value.length + 4;
}
function count2ByteArray(value) {
    return (value.length * 2) + 4;
}
function count4ByteArray(value) {
    return (value.length * 4) + 4;
}
function count8ByteArray(value) {
    return (value.length * 8) + 4;
}
function stringByteLength(str) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(str, 'utf8');
    }
    else {
        return new Blob([str]).size;
    }
}
function countString(value) {
    const length = stringByteLength(value);
    return length + 4;
}
const data = new Map();
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
const lerp = function (a, b, portion) {
    return a + ((b - a) * portion);
};
declareCustomBinaryType(Binary_1.Binary.UInt8, {
    write: (value, bw) => { bw.writeUInt8(value); },
    read: (br) => { return br.readUInt8(); },
    byteSize: () => { return 1; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.Int8, {
    write: (value, bw) => { bw.writeInt8(value); },
    read: (br) => { return br.readInt8(); },
    byteSize: () => { return 1; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.UInt16, {
    write: (value, bw) => { bw.writeUInt16(value); },
    read: (br) => { return br.readUInt16(); },
    byteSize: () => { return 2; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.Int16, {
    write: (value, bw) => { bw.writeInt16(value); },
    read: (br) => { return br.readInt16(); },
    byteSize: () => { return 2; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.UInt32, {
    write: (value, bw) => { bw.writeUInt32(value); },
    read: (br) => { return br.readUInt32(); },
    byteSize: () => { return 4; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.Int32, {
    write: (value, bw) => { bw.writeInt32(value); },
    read: (br) => { return br.readInt32(); },
    byteSize: () => { return 4; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.Float32, {
    write: (value, bw) => { bw.writeFloat32(value); },
    read: (br) => { return br.readFloat32(); },
    byteSize: () => { return 4; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.Float64, {
    write: (value, bw) => { bw.writeFloat64(value); },
    read: (br) => { return br.readFloat64(); },
    byteSize: () => { return 8; },
    compare: (a, b) => { return a === b; },
    interp: lerp
});
declareCustomBinaryType(Binary_1.Binary.String, {
    write: (value, bw) => { bw.writeString(value); },
    read: (br) => { return br.readString(); },
    byteSize: countString,
    compare: (a, b) => { return a === b; }
});
function compareTypedArray(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = a.length; -1 < i; i -= 1) {
        if ((a[i] !== b[i])) {
            return false;
        }
    }
    return true;
}
declareCustomBinaryType(Binary_1.Binary.UInt8Array, {
    write: (value, bw) => { bw.writeUInt8Array(value); },
    read: (br) => { return br.readUInt8Array(); },
    byteSize: countByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.Int8Array, {
    write: (value, bw) => { bw.writeInt8Array(value); },
    read: (br) => { return br.readInt8Array(); },
    byteSize: countByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.UInt16Array, {
    write: (value, bw) => { bw.writeUInt16Array(value); },
    read: (br) => { return br.readUInt16Array(); },
    byteSize: count2ByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.Int16Array, {
    write: (value, bw) => { bw.writeInt16Array(value); },
    read: (br) => { return br.readInt16Array(); },
    byteSize: count2ByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.UInt32Array, {
    write: (value, bw) => { bw.writeUInt32Array(value); },
    read: (br) => { return br.readUInt32Array(); },
    byteSize: count4ByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.Int32Array, {
    write: (value, bw) => { bw.writeInt32Array(value); },
    read: (br) => { return br.readInt32Array(); },
    byteSize: count4ByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.Float32Array, {
    write: (value, bw) => { bw.writeFloat32Array(value); },
    read: (br) => { return br.readFloat32Array(); },
    byteSize: count4ByteArray,
    compare: compareTypedArray
});
declareCustomBinaryType(Binary_1.Binary.Float64Array, {
    write: (value, bw) => { bw.writeFloat64Array(value); },
    read: (br) => { return br.readFloat64Array(); },
    byteSize: count8ByteArray,
    compare: compareTypedArray
});
function declareCustomBinaryType(binaryIndex, spec) {
    const { write, read, byteSize, compare, pre, post, interp } = spec;
    if (!write) {
        throw new Error('A custom binary type was declared with no write function. Please declare a function write(value: T, bw: IBinaryWirter) => void that writes your custom binary type to an IBinaryWriter.');
    }
    if (!read) {
        throw new Error('A custom binary type was declared with no read function. Please declare a function (readbr: IBinaryReader) => T that reads your custom binary tpe from an IBinaryReader.');
    }
    if (!byteSize) {
        throw new Error('A custom binary type was declared with no byteSize function. Please declare a function byteSize(a: T) => number that returns the byte size of your value.');
    }
    if (!compare) {
        throw new Error('A custom binary type was declared with no compare function. Please declare a function compare(a: T, b: T) => boolean that can compare two values of your binary type.');
    }
    data.set(binaryIndex, {
        write,
        read,
        byteSize,
        compare,
        // use the pre function or create a function that returns the value unchanged
        pre: (pre) ? pre : (value) => { return value; },
        // use the post function or create a function that returns the value unchanged
        post: (post) ? post : (value) => { return value; },
        // use the interp function or create a function that returns the most recent value uninterpolated
        interp: (interp) ? interp : (a, b, t) => { return b; }
    });
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
exports.declareCustomBinaryType = declareCustomBinaryType;
declareCustomBinaryType(Binary_1.Binary.Boolean, {
    write: (value, bw) => { bw.writeUInt8(value); },
    read: (br) => { return 1 === br.readUInt8(); },
    byteSize: () => { return 1; },
    compare: (a, b) => { return a === b; }
});
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
const binaryGet = function (binaryType) {
    return data.get(binaryType);
    // return data[binaryType]
};
exports.binaryGet = binaryGet;
