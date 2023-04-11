import { IBinaryReader } from './IBinaryReader';
/**
 * Wraps any "native" reader (such as BufferReader for node.js or DataViewReader for HTML5)
 * Abstracts from Instance/Client the actual binary implementation
 * Adds composite types such as Vector3
 * Allows for the defining of custom composite types
 */
declare class BinaryReader {
    nativeReader: IBinaryReader;
    constructor(nativeReader: IBinaryReader);
    readUInt8(): number;
    readInt8(): number;
    readUInt16(): number;
    readInt16(): number;
    readUInt32(): number;
    readInt32(): number;
    readFloat32(): number;
    readFloat64(): number;
    readBoolean(): boolean;
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
export { BinaryReader };
