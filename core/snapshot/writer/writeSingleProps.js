import { Chunk } from '../Chunk.js';
import Binary from '../../binary/Binary.js';
import BinaryType from '../../binary/BinaryType.js';
import writePartial from '../../protocol/write/writeSingle.js';

function writeSingleProps(chunkType, bitStream, singleProps) {
    if (singleProps.length > 0) {

        // ChunkType CreateEntities
        bitStream[Binary[BinaryType.UInt8].write](chunkType)

        // number of entities
        bitStream[Binary[BinaryType.UInt16].write](singleProps.length)


        for (var i = 0; i < singleProps.length; i++) {
            writePartial(bitStream, singleProps[i])
        }
        
        /*
        singleProps.forEach(singleProp => {
            writePartial(bitStream, singleProp)
        })
        */
    }
}

export default writeSingleProps;