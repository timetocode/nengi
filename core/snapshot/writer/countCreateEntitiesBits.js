import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countMessageBits from '../../protocol/countBits/countMessageBits.js';

function countCreateEntitiesBits(entities) {
    var bits = 0
    if (entities.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt16].bits
        entities.forEach(entity => {
            bits += countMessageBits(entity, entity.protocol)
        })
    }
    return bits
}

export default countCreateEntitiesBits;