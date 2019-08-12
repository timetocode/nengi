import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import writeJSON from '../../protocol/write/writeJSON.js';

function writeJSONs(bitStream, jsons) {
    if (jsons.length > 0) {

        bitStream[Binary[BinaryType.UInt8].write](Chunk.JSONs)

        // number of messages
        bitStream[Binary[BinaryType.UInt16].write](jsons.length)

        jsons.forEach(json => {
            writeJSON(bitStream, json)
        })
    }
}

export default writeJSONs;