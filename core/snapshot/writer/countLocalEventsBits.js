import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countMessageBits from '../../protocol/countBits/countMessageBits.js';

function countLocalEventsBits(localEvents) {
    var bits = 0
    if (localEvents.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt8].bits
        localEvents.forEach(localEvent => {
            bits += countMessageBits(localEvent, localEvent.protocol)
        })
    }
    return bits
}

export default countLocalEventsBits;