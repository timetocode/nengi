import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import countMessageBits from '../../protocol/countBits/countMessageBits';

function countMessagesBits(messages) {
    var bits = 0
    if (messages.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt16].bits
        for (var i = 0; i < messages.length; i++) {
            var message = messages[i]
            bits += countMessageBits(message, message.protocol)
        }
    }
    return bits
}

export default countMessagesBits;