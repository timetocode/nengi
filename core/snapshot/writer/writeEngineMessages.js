import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import writeMessage from '../../protocol/write/writeMessage.js';

function writeEngineMessages(bitStream, messages) {
    if (messages.length > 0) {

        // ChunkType CreateEntities
        bitStream[Binary[BinaryType.UInt8].write](Chunk.Engine)

        // number of messages
        bitStream[Binary[BinaryType.UInt16].write](messages.length)

        messages.forEach(message => {
            writeMessage(bitStream, message, message.protocol)
        })
    }
}

export default writeEngineMessages;