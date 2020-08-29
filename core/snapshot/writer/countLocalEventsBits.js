import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import countMessageBits from '../../protocol/countBits/countMessageBits';

function countLocalEventsBitsItem(bits, localEvent) {
    return bits + countMessageBits(localEvent, localEvent.protocol)
}

function countLocalEventsBits(localEvents) {
    var bits = 0
    if (localEvents.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt8].bits
        bits = localEvents.reduce(countLocalEventsBitsItem, bits)
    }
    return bits
}

export default countLocalEventsBits;