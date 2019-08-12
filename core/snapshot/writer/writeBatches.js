import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import writeBatch from '../../protocol/write/writeBatch.js';

function writeBatches(bitStream, batches) {
    if (batches.length > 0) {

        bitStream[Binary[BinaryType.UInt8].write](Chunk.UpdateEntitiesOptimized)
        bitStream[Binary[BinaryType.UInt16].write](batches.length)

        batches.forEach(batch => {
            writeBatch(bitStream, batch)
        })
    }
}

export default writeBatches;