import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import countMessageBits from '../../protocol/countBits/countMessageBits';

function addCreateEntitiesBits(total, entity) {
    return total + countMessageBits(entity, entity.protocol)
}

function countCreateEntitiesBits(entities) {
    var bits = 0
    if (entities.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt16].bits
        bits = entities.reduce(addCreateEntitiesBits, bits)
    }
    return bits
}

export default countCreateEntitiesBits;