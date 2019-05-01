import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import readMessage from '../../protocol/read/readMessage';
//var config = require('../../../config')

function readCommands(bitStream, protocols, config) {
    // number of commands
    var length = bitStream[Binary[BinaryType.UInt16].read]()
    var commands = []
    for (var i = 0; i < length; i++) {
        var type = bitStream[Binary[config.TYPE_BINARY_TYPE].read]()
        var protocol = protocols.getProtocol(type)
        var command = readMessage(
            bitStream, 
            protocol, 
            1, 
            type, 
            config.TYPE_PROPERTY_NAME
        )
        command.protocol = protocol
        commands.push(command)
    }
    return commands    
}

export default readCommands;