interface IBinaryWriter {
    // ALSO, but hidden from typescript:
    // new(bufferOrArrayBuffer: any, offset?: number): IBinaryWriter
    // static create(byteLength): IBinaryWriter
    buffer: Buffer | ArrayBuffer
    writeUInt8(value: number): void
    writeInt8(value: number): void
    writeUInt16(value: number): void
    writeInt16(value: number): void
    writeUInt32(value: number): void
    writeInt32(value: number): void
    writeFloat32(value: number): void
    writeFloat64(value: number): void
    writeString(value: string): void
    writeUInt8Array(value: Uint8Array): void
}
interface IBinaryWriterClass {
    // note: real type is Buffer | ArrayBuffer!
    new(bufferOrArrayBuffer: any, offset?: number): IBinaryWriter

    // ALSO HAS THIS, which is unfortunately not valid typescript
    // static create(byteLength): IBinaryWriter
}

export { IBinaryWriter, IBinaryWriterClass }