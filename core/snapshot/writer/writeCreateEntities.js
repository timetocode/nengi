import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import writeMessage from '../../protocol/write/writeMessage.js';

function writeCreateEntities(chunkType, bitStream, entities) {
    if (entities.length > 0) {

        bitStream[Binary[BinaryType.UInt8].write](chunkType)

        // number of entities
        bitStream[Binary[BinaryType.UInt16].write](entities.length)

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i]
            writeMessage(bitStream, entity, entity.protocol)
        }
    }
}

export default writeCreateEntities;