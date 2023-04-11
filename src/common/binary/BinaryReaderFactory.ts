import { BinaryReader } from './BinaryReader'
import { IBinaryReader } from './IBinaryReader'

class BinaryReaderFactory {
    nativeReader: IBinaryReader

    constructor(nativeReader: IBinaryReader) {
        this.nativeReader = nativeReader
    }

    create() {
        return new BinaryReader(this.nativeReader)
    }
}

export { BinaryReaderFactory }