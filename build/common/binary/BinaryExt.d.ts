import { Binary } from './Binary';
declare function countString(value: string): number;
type RegularOrTypedArray = [] | Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;
declare function countByteArray(value: RegularOrTypedArray): number;
declare function count2ByteArray(value: RegularOrTypedArray): number;
declare function count4ByteArray(value: RegularOrTypedArray): number;
declare function count8ByteArray(value: RegularOrTypedArray): number;
export default function (binaryType: Binary): {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countString;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof count2ByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof count2ByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof count4ByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof count4ByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof count8ByteArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof count8ByteArray;
};
export {};
