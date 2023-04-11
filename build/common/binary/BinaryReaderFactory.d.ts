import { BinaryReader } from './BinaryReader';
import { IBinaryReader } from './IBinaryReader';
declare class BinaryReaderFactory {
    nativeReader: IBinaryReader;
    constructor(nativeReader: IBinaryReader);
    create(): BinaryReader;
}
export { BinaryReaderFactory };
