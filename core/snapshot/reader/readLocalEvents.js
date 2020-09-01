import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import readMessage from '../../protocol/read/readMessage';
//var config = require('../../../config')

function readLocalEvents(bitStream, protocols, config) {
    // number of events
    var length = bitStream[Binary[BinaryType.UInt8].read]()

    var events = new Array(length);
    for (var i = 0; i < length; i++) {
        var type = bitStream[Binary[config.TYPE_BINARY_TYPE].read]()
        var protocol = protocols.getProtocol(type)
        var event = readMessage(
            bitStream,
            protocol,
            1,
            type,
            config.TYPE_PROPERTY_NAME
        )
        event.protocol = protocol
        events[i] = event
    }
    return events
}

export default readLocalEvents;