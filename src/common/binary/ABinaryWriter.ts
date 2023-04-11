abstract class ABinaryWriter {
    abstract buffer: Buffer | ArrayBuffer
    abstract offset: number
    constructor(buffer: Buffer | ArrayBuffer, offset?: number) { }
    abstract writeUInt8(value: number): void
    abstract writeInt8(value: number): void
    abstract writeUInt16(value: number): void
    abstract writeInt16(value: number): void
    abstract writeUInt32(value: number): void
    abstract writeInt32(value: number): void
    abstract writeFloat32(value: number): void
    abstract writeFloat64(value: number): void
    abstract writeBoolean(value: boolean): void
    abstract writeString(value: string): void
    abstract writeUInt8Array(value: Uint8Array): void
    abstract writeInt8Array(value: Int8Array): void
    abstract writeUInt16Array(value: Uint16Array): void
    abstract writeInt16Array(value: Int16Array): void
    abstract writeUInt32Array(value: Uint32Array): void
    abstract writeInt32Array(value: Int32Array): void
    abstract writeFloat32Array(value: Float32Array): void
    abstract writeFloat64Array(value: Float64Array): void
}

export { ABinaryWriter }