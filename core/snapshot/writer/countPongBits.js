import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function countPongBits(key) {
    var bits = 0
    if (key > -1) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt8].bits
    }
    return bits
}

export default countPongBits;