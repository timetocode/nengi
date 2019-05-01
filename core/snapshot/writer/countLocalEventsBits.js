import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import countMessageBits from '../../protocol/countBits/countMessageBits';

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