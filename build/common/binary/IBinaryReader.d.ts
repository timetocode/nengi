interface IBinaryReader {
    offset: number;
    byteLength: number;
    readUInt8: () => number;
    readInt8: () => number;
    readUInt16: () => number;
    readInt16: () => number;
    readUInt32: () => number;
    readInt32: () => number;
    readFloat32: () => number;
    readFloat64: () => number;
    readString: () => string;
    readUInt8Array: () => Uint8Array;
}
interface IBinaryReaderClass {
    new (bufferOrArrayBuffer: any, offset?: number): IBinaryReader;
}
export { IBinaryReader, IBinaryReaderClass };
