import { Binary } from './Binary';
import { IBinaryReader } from './IBinaryReader';
import { IBinaryWriter } from './IBinaryWriter';
type SimpleBinarySpecification = {
    bytes: number;
    write: string;
    read: string;
};
type AdvancedBinarySpecification<T> = {
    write: (value: any, bw: IBinaryWriter) => void;
    read: (br: IBinaryReader) => T;
    byteSize: (value: any) => number;
    compare: (a: T, b: T) => boolean;
    pre?: (value: any) => T;
    post?: (value: any) => T;
    interp?: (a: T, b: T, t: number) => T;
};
type BinarySpecification = SimpleBinarySpecification | AdvancedBinarySpecification<any>;
declare function declareCustomBinaryType<T>(binaryIndex: number, spec: AdvancedBinarySpecification<T>): void;
declare const binaryGet: (binaryType: Binary) => BinarySpecification;
export { binaryGet, declareCustomBinaryType };
