import { ABinaryWriter } from './ABinaryWriter'
import { IBinaryWriter } from './IBinaryWriter'
/**
 * Wraps any "native" writer (such as BufferWriter for node.js or DataViewWriter for HTML5)
 * Abstracts from Instance/Client the actual binary implementation
 * Adds composite types such as Vector3
 * Allows for the defining of custom composite types
 */
class BinaryWriter {
    nativeWriter: IBinaryWriter

    constructor(nativeWriter: IBinaryWriter) {
        this.nativeWriter = nativeWriter
    }

    writeUInt8(value: number) { this.nativeWriter.writeUInt8(value) }
    writeInt8(value: number) { this.nativeWriter.writeInt8(value) }
    writeUInt16(value: number) { this.nativeWriter.writeUInt16(value) }
    writeInt16(value: number) { this.nativeWriter.writeInt16(value) }
    writeUInt32(value: number) { this.nativeWriter.writeUInt32(value) }
    writeInt32(value: number) { this.nativeWriter.writeInt32(value) }
    writeFloat32(value: number) { this.nativeWriter.writeFloat32(value) }
    writeFloat64(value: number) { this.nativeWriter.writeFloat64(value) }
    writeBoolean(value: boolean) { this.nativeWriter.writeBoolean(value) }
    writeString(value: string) { this.nativeWriter.writeString(value) }
    writeUInt8Array(value: Uint8Array) { this.nativeWriter.writeUInt8Array(value) }
    writeInt8Array(value: Int8Array) { this.nativeWriter.writeInt8Array(value) }
    writeUInt16Array(value: Uint16Array) { this.nativeWriter.writeUInt16Array(value) }
    writeInt16Array(value: Int16Array) { this.nativeWriter.writeInt16Array(value) }
    writeUInt32Array(value: Uint32Array) { this.nativeWriter.writeUInt32Array(value) }
    writeInt32Array(value: Int32Array) { this.nativeWriter.writeInt32Array(value) }
    writeFloat32Array(value: Float32Array) { this.nativeWriter.writeFloat32Array(value) }
    writeFloat64Array(value: Float64Array) { this.nativeWriter.writeFloat64Array(value) }

    writeVector2() {

    }
}

export { BinaryWriter }