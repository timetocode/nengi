import { IBinaryReader } from './IBinaryReader'

abstract class ABinaryReader {
    abstract buffer: Buffer | ArrayBuffer
    abstract offset: number
    abstract byteLength: number
    constructor(buffer: Buffer | ArrayBuffer, offset?: number) {}
    abstract readUInt8: () => number
    abstract readInt8: () => number
    abstract readUInt16: () => number
    abstract readInt16: () => number
    abstract readUInt32: () => number
    abstract readInt32: () => number
    abstract readFloat32: () => number
    abstract readFloat64: () => number
    abstract readBoolean: () => boolean
    abstract readString: () => string
    abstract readUInt8Array: () => Uint8Array
    abstract readInt8Array: () => Int8Array
    abstract readUInt16Array: () => Uint16Array
    abstract readInt16Array: () => Int16Array
    abstract readUInt32Array: () => Uint32Array
    abstract readInt32Array: () => Int32Array
    abstract readFloat32Array: () => Float32Array
    abstract readFloat64Array: () => Float64Array
}

export { ABinaryReader}