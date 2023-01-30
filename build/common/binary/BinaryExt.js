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
function count(value) {
    // TODO need a node 16 way of reading the string length in both browser and node
    // blob might be node17+?
    //const length = Buffer.byteLength(value, 'utf8')
    //const length = new Blob([value]).size
    const length = stringByteLength(value);
    console.log('COUNT invoked', value);
    return length + 4;
}
function countUInt8Array(value) {
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
    [Binary_1.Binary.String]: { bytes: -1, write: 'writeString', read: 'readString', count },
    [Binary_1.Binary.UInt8Array]: { bytes: -1, write: 'writeUInt8Array', read: 'readUInt8Array', count: countUInt8Array },
};
function default_1(binaryType) {
    return data[binaryType];
}
exports.default = default_1;
