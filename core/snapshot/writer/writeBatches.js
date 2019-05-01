import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import writeBatch from '../../protocol/write/writeBatch';

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