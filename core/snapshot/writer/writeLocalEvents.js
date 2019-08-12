import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import writeMessage from '../../protocol/write/writeMessage.js';

function writeLocalEvents(bitStream, localEvents) {
    if (localEvents.length > 0) {

        bitStream[Binary[BinaryType.UInt8].write](Chunk.LocalEvents)  
        bitStream[Binary[BinaryType.UInt16].write](localEvents.length)

        localEvents.forEach(localEvent => {
            writeMessage(bitStream, localEvent, localEvent.protocol)
        })
    }
}

export default writeLocalEvents;