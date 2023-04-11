"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryReader = void 0;
/**
 * Wraps any "native" reader (such as BufferReader for node.js or DataViewReader for HTML5)
 * Abstracts from Instance/Client the actual binary implementation
 * Adds composite types such as Vector3
 * Allows for the defining of custom composite types
 */
class BinaryReader {
    constructor(nativeReader) {
        this.nativeReader = nativeReader;
    }
    readUInt8() { return this.nativeReader.readUInt8(); }
    readInt8() { return this.nativeReader.readInt8(); }
    readUInt16() { return this.nativeReader.readUInt16(); }
    readInt16() { return this.nativeReader.readInt16(); }
    readUInt32() { return this.nativeReader.readUInt32(); }
    readInt32() { return this.nativeReader.readInt32(); }
    readFloat32() { return this.nativeReader.readFloat32(); }
    readFloat64() { return this.nativeReader.readFloat64(); }
    readBoolean() { return this.nativeReader.readBoolean(); }
    readString() { return this.nativeReader.readString(); }
    readUInt8Array() { return this.nativeReader.readUInt8Array(); }
    readInt8Array() { return this.nativeReader.readInt8Array(); }
    readUInt16Array() { return this.nativeReader.readUInt16Array(); }
    readInt16Array() { return this.nativeReader.readInt16Array(); }
    readUInt32Array() { return this.nativeReader.readUInt32Array(); }
    readInt32Array() { return this.nativeReader.readInt32Array(); }
    readFloat32Array() { return this.nativeReader.readFloat32Array(); }
    readFloat64Array() { return this.nativeReader.readFloat64Array(); }
}
exports.BinaryReader = BinaryReader;
