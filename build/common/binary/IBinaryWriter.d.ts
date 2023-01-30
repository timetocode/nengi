/// <reference types="node" />
interface IBinaryWriter {
    buffer: Buffer | ArrayBuffer;
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
}
interface IBinaryWriterClass {
    new (bufferOrArrayBuffer: any, offset?: number): IBinaryWriter;
}
export { IBinaryWriter, IBinaryWriterClass };
