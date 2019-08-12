import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import countMessageBits from '../../protocol/countBits/countMessageBits.js';

function countCommandsBits(commands) {
    var bits = 0

    bits += Binary[BinaryType.UInt8].bits
    bits += Binary[BinaryType.UInt16].bits
    for (var i = 0; i < commands.length; i++) {
        var command = commands[i]
        bits += countMessageBits(command, command.protocol)
    }
    
    return bits
}

export default countCommandsBits;