"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryWriter = void 0;
/**
 * Wraps any "native" writer (such as BufferWriter for node.js or DataViewWriter for HTML5)
 * Abstracts from Instance/Client the actual binary implementation
 * Adds composite types such as Vector3
 * Allows for the defining of custom composite types
 */
class BinaryWriter {
    constructor(nativeWriter) {
        this.nativeWriter = nativeWriter;
    }
    writeUInt8(value) { this.nativeWriter.writeUInt8(value); }
    writeInt8(value) { this.nativeWriter.writeInt8(value); }
    writeUInt16(value) { this.nativeWriter.writeUInt16(value); }
    writeInt16(value) { this.nativeWriter.writeInt16(value); }
    writeUInt32(value) { this.nativeWriter.writeUInt32(value); }
    writeInt32(value) { this.nativeWriter.writeInt32(value); }
    writeFloat32(value) { this.nativeWriter.writeFloat32(value); }
    writeFloat64(value) { this.nativeWriter.writeFloat64(value); }
    writeBoolean(value) { this.nativeWriter.writeBoolean(value); }
    writeString(value) { this.nativeWriter.writeString(value); }
    writeUInt8Array(value) { this.nativeWriter.writeUInt8Array(value); }
    writeInt8Array(value) { this.nativeWriter.writeInt8Array(value); }
    writeUInt16Array(value) { this.nativeWriter.writeUInt16Array(value); }
    writeInt16Array(value) { this.nativeWriter.writeInt16Array(value); }
    writeUInt32Array(value) { this.nativeWriter.writeUInt32Array(value); }
    writeInt32Array(value) { this.nativeWriter.writeInt32Array(value); }
    writeFloat32Array(value) { this.nativeWriter.writeFloat32Array(value); }
    writeFloat64Array(value) { this.nativeWriter.writeFloat64Array(value); }
    writeVector2() {
    }
}
exports.BinaryWriter = BinaryWriter;
