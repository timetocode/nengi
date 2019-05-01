import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import writeMessage from '../../protocol/write/writeMessage';

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