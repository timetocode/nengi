import { Binary } from './Binary';
import { IBinaryReader } from './IBinaryReader';
import { IBinaryWriter } from './IBinaryWriter';
/**
 * User definable binary type
 */
type CustomBinarySpecification<T> = {
    write: (value: any, bw: IBinaryWriter) => void;
    read: (br: IBinaryReader) => T;
    byteSize: (value: any) => number;
    compare: (a: T, b: T) => boolean;
    pre?: (value: any) => T;
    post?: (value: any) => T;
    interp?: (a: T, b: T, t: number) => T;
    clone?: (value: any) => T;
};
/**
 * Engine's version of a binary specification
 * this has all of the functions filled in
 * unlike the CustomBinarySpecification where
 * some are optional
 */
type BinarySpecification<T> = {
    write: (value: any, bw: IBinaryWriter) => void;
    read: (br: IBinaryReader) => T;
    byteSize: (value: any) => number;
    compare: (a: T, b: T) => boolean;
    pre: (value: any) => T;
    post: (value: any) => T;
    interp: (a: T, b: T, t: number) => T;
    clone: (value: any) => T;
};
declare function declareBinaryType<T>(binaryIndex: number, spec: CustomBinarySpecification<T>): void;
declare const binaryGet: (binaryType: Binary) => BinarySpecification<any>;
export { binaryGet, declareBinaryType };
//# sourceMappingURL=BinaryExt.d.ts.map