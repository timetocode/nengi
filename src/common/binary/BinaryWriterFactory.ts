import { ABinaryWriter } from './ABinaryWriter'
import { BinaryWriter } from './BinaryWriter'
import { IBinaryWriter } from './IBinaryWriter'

class BinaryWriterFactory {
    nativeWriter: IBinaryWriter

    bufferOrArrayBufferCtor: any
    constructor(nativeWriter: IBinaryWriter, bufferOrArrayBufferCtor: any) {
        this.nativeWriter = nativeWriter
        this.bufferOrArrayBufferCtor = bufferOrArrayBufferCtor
    }

    create(bytes: number) {
        const n = new this.nativeWriter(new this.bufferOrArrayBufferCtor())
        return new BinaryWriter(n)
    }
}

export { BinaryWriterFactory }