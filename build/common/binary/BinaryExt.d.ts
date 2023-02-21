import { Binary } from './Binary';
declare function countString(value: string): number;
type TypedArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;
declare function countTypedArray(value: TypedArray): number;
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
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
} | {
    bytes: number;
    write: string;
    read: string;
    count: typeof countTypedArray;
};
export {};
