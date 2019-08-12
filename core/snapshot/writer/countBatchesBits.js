import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countBatchBits from '../../protocol/countBits/countBatchBits.js';

function countBatchesBits(batches) {
    var bits = 0
    if (batches.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt16].bits
        batches.forEach(batch => {
            bits += countBatchBits(batch)
        })
    }
    return bits
}

export default countBatchesBits;