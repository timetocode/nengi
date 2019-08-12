import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function countTimesyncBits(time) {
    var bits = 0
    if (time > -1) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.Float64].bits
        bits += Binary[BinaryType.UInt9].bits
    }
    //console.log('countTimesyncBits', bits)
    return bits
}

export default countTimesyncBits;