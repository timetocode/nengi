import { BinaryWriter } from './BinaryWriter';
import { IBinaryWriter } from './IBinaryWriter';
declare class BinaryWriterFactory {
    nativeWriter: IBinaryWriter;
    bufferOrArrayBufferCtor: any;
    constructor(nativeWriter: IBinaryWriter, bufferOrArrayBufferCtor: any);
    create(bytes: number): BinaryWriter;
}
export { BinaryWriterFactory };
