import { Buffer } from 'buffer';
import { BinaryAdapter } from '../common/binary/BinaryAdapter';
import { IBinaryReader } from '../common/binary/IBinaryReader';
import { IBinaryWriter } from '../common/binary/IBinaryWriter';
declare class TestBufferWriter implements IBinaryWriter<Buffer> {
    buffer: Buffer;
    offset: number;
    constructor(buffer: Buffer, offset?: number);
    get payload(): Buffer;
    static create(byteLength: number): TestBufferWriter;
    writeUInt8(value: number): void;
    writeInt8(value: number): void;
    writeUInt16(value: number): void;
    writeInt16(value: number): void;
    writeUInt32(value: number): void;
    writeInt32(value: number): void;
    writeFloat32(value: number): void;
    writeFloat64(value: number): void;
    writeString(value: string): void;
    writeUInt8Array(value: Uint8Array): void;
    writeInt8Array(value: Int8Array): void;
    writeUInt16Array(value: Uint16Array): void;
    writeInt16Array(value: Int16Array): void;
    writeUInt32Array(value: Uint32Array): void;
    writeInt32Array(value: Int32Array): void;
    writeFloat32Array(value: Float32Array): void;
    writeFloat64Array(value: Float64Array): void;
}
declare class TestBufferReader implements IBinaryReader {
    buffer: Buffer;
    offset: number;
    constructor(buffer: Buffer, offset?: number);
    get byteLength(): number;
    readUInt8(): number;
    readInt8(): number;
    readUInt16(): number;
    readInt16(): number;
    readUInt32(): number;
    readInt32(): number;
    readFloat32(): number;
    readFloat64(): number;
    readString(): string;
    readUInt8Array(): Uint8Array;
    readInt8Array(): Int8Array;
    readUInt16Array(): Uint16Array;
    readInt16Array(): Int16Array;
    readUInt32Array(): Uint32Array;
    readInt32Array(): Int32Array;
    readFloat32Array(): Float32Array;
    readFloat64Array(): Float64Array;
}
declare const testBinaryAdapter: BinaryAdapter<Buffer, Buffer>;
export { TestBufferReader, TestBufferWriter, testBinaryAdapter };
//# sourceMappingURL=BufferBinary.d.ts.map