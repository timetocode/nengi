import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import readMessage from '../../protocol/read/readMessage';
//var config = require('../../../config')

function readEngineMessages(bitStream, protocols, config) {
    // number of messages
    var length = bitStream[Binary[BinaryType.UInt16].read]()

    var messages = []
    for (var i = 0; i < length; i++) {

        var type = bitStream[Binary[config.TYPE_BINARY_TYPE].read]()
        var protocol = protocols.getMetaProtocol(type)
        var message = readMessage(
            bitStream,
            protocol, 
            1, 
            type, 
            config.TYPE_PROPERTY_NAME
        )
        message.protocol = protocol
        messages.push(message)
        //console.log('read message', message)
        
    }
    return messages  
}

export default readEngineMessages;