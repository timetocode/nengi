import { Buffer } from 'buffer'
import { BinaryAdapter } from '../common/binary/BinaryAdapter'
import { IBinaryReader } from '../common/binary/IBinaryReader'
import { IBinaryWriter } from '../common/binary/IBinaryWriter'

class TestBufferWriter implements IBinaryWriter<Buffer> {
    buffer: Buffer
    offset: number

    constructor(buffer: Buffer, offset?: number) {
        this.buffer = buffer
        this.offset = offset || 0
    }

    get payload(): Buffer {
        return this.buffer
    }

    static create(byteLength: number): TestBufferWriter {
        return new TestBufferWriter(Buffer.allocUnsafe(byteLength))
    }

    writeUInt8(value: number) {
        this.buffer.writeUInt8(value, this.offset)
        this.offset += 1
    }

    writeInt8(value: number) {
        this.buffer.writeInt8(value, this.offset)
        this.offset += 1
    }

    writeUInt16(value: number) {
        this.buffer.writeUInt16BE(value, this.offset)
        this.offset += 2
    }

    writeInt16(value: number) {
        this.buffer.writeInt16BE(value, this.offset)
        this.offset += 2
    }

    writeUInt32(value: number) {
        this.buffer.writeUInt32BE(value, this.offset)
        this.offset += 4
    }

    writeInt32(value: number) {
        this.buffer.writeInt32BE(value, this.offset)
        this.offset += 4
    }

    writeFloat32(value: number) {
        this.buffer.writeFloatBE(value, this.offset)
        this.offset += 4
    }

    writeFloat64(value: number) {
        this.buffer.writeDoubleBE(value, this.offset)
        this.offset += 8
    }

    writeString(value: string) {
        const length = Buffer.byteLength(value, 'utf8')
        this.writeUInt32(length)
        this.buffer.write(value, this.offset, 'utf8')
        this.offset += length
    }

    writeUInt8Array(value: Uint8Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeUInt8(value[i])
        }
    }

    writeInt8Array(value: Int8Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeInt8(value[i])
        }
    }

    writeUInt16Array(value: Uint16Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeUInt16(value[i])
        }
    }

    writeInt16Array(value: Int16Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeInt16(value[i])
        }
    }

    writeUInt32Array(value: Uint32Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeUInt32(value[i])
        }
    }

    writeInt32Array(value: Int32Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeInt32(value[i])
        }
    }

    writeFloat32Array(value: Float32Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeFloat32(value[i])
        }
    }

    writeFloat64Array(value: Float64Array) {
        this.writeUInt32(value.length)
        for (let i = 0; i < value.length; i++) {
            this.writeFloat64(value[i])
        }
    }
}

class TestBufferReader implements IBinaryReader {
    buffer: Buffer
    offset: number

    constructor(buffer: Buffer, offset?: number) {
        this.buffer = buffer
        this.offset = offset || 0
    }

    get byteLength() {
        return this.buffer.byteLength
    }

    readUInt8(): number {
        const value = this.buffer.readUInt8(this.offset)
        this.offset += 1
        return value
    }

    readInt8(): number {
        const value = this.buffer.readInt8(this.offset)
        this.offset += 1
        return value
    }

    readUInt16(): number {
        const value = this.buffer.readUInt16BE(this.offset)
        this.offset += 2
        return value
    }

    readInt16(): number {
        const value = this.buffer.readInt16BE(this.offset)
        this.offset += 2
        return value
    }

    readUInt32(): number {
        const value = this.buffer.readUInt32BE(this.offset)
        this.offset += 4
        return value
    }

    readInt32(): number {
        const value = this.buffer.readInt32BE(this.offset)
        this.offset += 4
        return value
    }

    readFloat32(): number {
        const value = this.buffer.readFloatBE(this.offset)
        this.offset += 4
        return value
    }

    readFloat64(): number {
        const value = this.buffer.readDoubleBE(this.offset)
        this.offset += 8
        return value
    }

    readString(): string {
        const length = this.readUInt32()
        const value = this.buffer.toString('utf8', this.offset, this.offset + length)
        this.offset += length
        return value
    }

    readUInt8Array(): Uint8Array {
        const length = this.readUInt32()
        const arr = new Uint8Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readUInt8()
        }
        return arr
    }

    readInt8Array(): Int8Array {
        const length = this.readUInt32()
        const arr = new Int8Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readInt8()
        }
        return arr
    }

    readUInt16Array(): Uint16Array {
        const length = this.readUInt32()
        const arr = new Uint16Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readUInt16()
        }
        return arr
    }

    readInt16Array(): Int16Array {
        const length = this.readUInt32()
        const arr = new Int16Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readInt16()
        }
        return arr
    }

    readUInt32Array(): Uint32Array {
        const length = this.readUInt32()
        const arr = new Uint32Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readUInt32()
        }
        return arr
    }

    readInt32Array(): Int32Array {
        const length = this.readUInt32()
        const arr = new Int32Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readInt32()
        }
        return arr
    }

    readFloat32Array(): Float32Array {
        const length = this.readUInt32()
        const arr = new Float32Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readFloat32()
        }
        return arr
    }

    readFloat64Array(): Float64Array {
        const length = this.readUInt32()
        const arr = new Float64Array(length)
        for (let i = 0; i < length; i++) {
            arr[i] = this.readFloat64()
        }
        return arr
    }
}

const testBinaryAdapter: BinaryAdapter<Buffer, Buffer> = {
    createWriter: (byteLength: number) => TestBufferWriter.create(byteLength),
    createReader: (payload: Buffer) => new TestBufferReader(payload)
}

export { TestBufferReader, TestBufferWriter, testBinaryAdapter }
