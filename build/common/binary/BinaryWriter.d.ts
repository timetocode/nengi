import { IBinaryWriter } from './IBinaryWriter';
/**
 * Wraps any "native" writer (such as BufferWriter for node.js or DataViewWriter for HTML5)
 * Abstracts from Instance/Client the actual binary implementation
 * Adds composite types such as Vector3
 * Allows for the defining of custom composite types
 */
declare class BinaryWriter {
    nativeWriter: IBinaryWriter;
    constructor(nativeWriter: IBinaryWriter);
    writeUInt8(value: number): void;
    writeInt8(value: number): void;
    writeUInt16(value: number): void;
    writeInt16(value: number): void;
    writeUInt32(value: number): void;
    writeInt32(value: number): void;
    writeFloat32(value: number): void;
    writeFloat64(value: number): void;
    writeBoolean(value: boolean): void;
    writeString(value: string): void;
    writeUInt8Array(value: Uint8Array): void;
    writeInt8Array(value: Int8Array): void;
    writeUInt16Array(value: Uint16Array): void;
    writeInt16Array(value: Int16Array): void;
    writeUInt32Array(value: Uint32Array): void;
    writeInt32Array(value: Int32Array): void;
    writeFloat32Array(value: Float32Array): void;
    writeFloat64Array(value: Float64Array): void;
    writeVector2(): void;
}
export { BinaryWriter };
