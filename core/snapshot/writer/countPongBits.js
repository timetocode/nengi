import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function countPongBits(key) {
    var bits = 0
    if (key > -1) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt8].bits
    }
    return bits
}

export default countPongBits;