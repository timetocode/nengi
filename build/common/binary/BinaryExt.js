"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("./Binary");
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
function countTypedArray(value) {
    return value.byteLength + 4;
}
const data = {
    [Binary_1.Binary.UInt8]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },
    [Binary_1.Binary.Int8]: { bytes: 1, write: 'writeInt8', read: 'readInt8' },
    [Binary_1.Binary.UInt16]: { bytes: 2, write: 'writeUInt16', read: 'readUInt16' },
    [Binary_1.Binary.Int16]: { bytes: 2, write: 'writeInt16', read: 'readInt16' },
    [Binary_1.Binary.UInt32]: { bytes: 4, write: 'writeUInt32', read: 'readUInt32' },
    [Binary_1.Binary.Int32]: { bytes: 4, write: 'writeInt32', read: 'readInt32' },
    [Binary_1.Binary.Float32]: { bytes: 4, write: 'writeFloat32', read: 'readFloat32' },
    [Binary_1.Binary.Float64]: { bytes: 8, write: 'writeFloat64', read: 'readFloat64' },
    [Binary_1.Binary.Boolean]: { bytes: 1, write: 'writeUInt8', read: 'readUInt8' },
    [Binary_1.Binary.String]: { bytes: -1, write: 'writeString', read: 'readString', count: countString },
    [Binary_1.Binary.UInt8Array]: { bytes: -1, write: 'writeUInt8Array', read: 'readUInt8Array', count: countTypedArray },
    [Binary_1.Binary.Int8Array]: { bytes: -1, write: 'writeInt8Array', read: 'readInt8Array', count: countTypedArray },
    [Binary_1.Binary.UInt16Array]: { bytes: -1, write: 'writeUInt16Array', read: 'readUInt16Array', count: countTypedArray },
    [Binary_1.Binary.Int16Array]: { bytes: -1, write: 'writeInt16Array', read: 'readInt16Array', count: countTypedArray },
    [Binary_1.Binary.UInt32Array]: { bytes: -1, write: 'writeUInt32Array', read: 'readUInt32Array', count: countTypedArray },
    [Binary_1.Binary.Int32Array]: { bytes: -1, write: 'writeInt32Array', read: 'readInt32Array', count: countTypedArray },
    [Binary_1.Binary.Float32Array]: { bytes: -1, write: 'writeFloat32Array', read: 'readFloat32Array', count: countTypedArray },
    [Binary_1.Binary.Float64Array]: { bytes: -1, write: 'writeFloat64Array', read: 'readFloat64Array', count: countTypedArray },
};
function default_1(binaryType) {
    return data[binaryType];
}
exports.default = default_1;
