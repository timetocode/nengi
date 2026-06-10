"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testBinaryAdapter = exports.TestBufferWriter = exports.TestBufferReader = void 0;
const buffer_1 = require("buffer");
class TestBufferWriter {
    constructor(buffer, offset) {
        this.buffer = buffer;
        this.offset = offset || 0;
    }
    get payload() {
        return this.buffer;
    }
    static create(byteLength) {
        return new TestBufferWriter(buffer_1.Buffer.allocUnsafe(byteLength));
    }
    writeUInt8(value) {
        this.buffer.writeUInt8(value, this.offset);
        this.offset += 1;
    }
    writeInt8(value) {
        this.buffer.writeInt8(value, this.offset);
        this.offset += 1;
    }
    writeUInt16(value) {
        this.buffer.writeUInt16BE(value, this.offset);
        this.offset += 2;
    }
    writeInt16(value) {
        this.buffer.writeInt16BE(value, this.offset);
        this.offset += 2;
    }
    writeUInt32(value) {
        this.buffer.writeUInt32BE(value, this.offset);
        this.offset += 4;
    }
    writeInt32(value) {
        this.buffer.writeInt32BE(value, this.offset);
        this.offset += 4;
    }
    writeFloat32(value) {
        this.buffer.writeFloatBE(value, this.offset);
        this.offset += 4;
    }
    writeFloat64(value) {
        this.buffer.writeDoubleBE(value, this.offset);
        this.offset += 8;
    }
    writeString(value) {
        const length = buffer_1.Buffer.byteLength(value, 'utf8');
        this.writeUInt32(length);
        this.buffer.write(value, this.offset, 'utf8');
        this.offset += length;
    }
    writeBytes(value) {
        this.buffer.set(value, this.offset);
        this.offset += value.byteLength;
    }
    writeUInt8Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeUInt8(value[i]);
        }
    }
    writeInt8Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeInt8(value[i]);
        }
    }
    writeUInt16Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeUInt16(value[i]);
        }
    }
    writeInt16Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeInt16(value[i]);
        }
    }
    writeUInt32Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeUInt32(value[i]);
        }
    }
    writeInt32Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeInt32(value[i]);
        }
    }
    writeFloat32Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeFloat32(value[i]);
        }
    }
    writeFloat64Array(value) {
        this.writeUInt32(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeFloat64(value[i]);
        }
    }
}
exports.TestBufferWriter = TestBufferWriter;
class TestBufferReader {
    constructor(buffer, offset) {
        this.buffer = buffer;
        this.offset = offset || 0;
    }
    get byteLength() {
        return this.buffer.byteLength;
    }
    readUInt8() {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }
    readInt8() {
        const value = this.buffer.readInt8(this.offset);
        this.offset += 1;
        return value;
    }
    readUInt16() {
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }
    readInt16() {
        const value = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return value;
    }
    readUInt32() {
        const value = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }
    readInt32() {
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }
    readFloat32() {
        const value = this.buffer.readFloatBE(this.offset);
        this.offset += 4;
        return value;
    }
    readFloat64() {
        const value = this.buffer.readDoubleBE(this.offset);
        this.offset += 8;
        return value;
    }
    readString() {
        const length = this.readUInt32();
        const value = this.buffer.toString('utf8', this.offset, this.offset + length);
        this.offset += length;
        return value;
    }
    readUInt8Array() {
        const length = this.readUInt32();
        const arr = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readUInt8();
        }
        return arr;
    }
    readInt8Array() {
        const length = this.readUInt32();
        const arr = new Int8Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readInt8();
        }
        return arr;
    }
    readUInt16Array() {
        const length = this.readUInt32();
        const arr = new Uint16Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readUInt16();
        }
        return arr;
    }
    readInt16Array() {
        const length = this.readUInt32();
        const arr = new Int16Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readInt16();
        }
        return arr;
    }
    readUInt32Array() {
        const length = this.readUInt32();
        const arr = new Uint32Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readUInt32();
        }
        return arr;
    }
    readInt32Array() {
        const length = this.readUInt32();
        const arr = new Int32Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readInt32();
        }
        return arr;
    }
    readFloat32Array() {
        const length = this.readUInt32();
        const arr = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readFloat32();
        }
        return arr;
    }
    readFloat64Array() {
        const length = this.readUInt32();
        const arr = new Float64Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readFloat64();
        }
        return arr;
    }
}
exports.TestBufferReader = TestBufferReader;
const testBinaryAdapter = {
    createWriter: (byteLength) => TestBufferWriter.create(byteLength),
    createReader: (payload) => new TestBufferReader(payload)
};
exports.testBinaryAdapter = testBinaryAdapter;
