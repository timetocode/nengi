import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function countTransferBits(key) {
    var bits = 0
    if (key !== -1) {
    	bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UTF8String].countBits(key)
    }
    return bits
}

export default countTransferBits;