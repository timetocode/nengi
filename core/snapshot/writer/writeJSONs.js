import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import writeJSON from '../../protocol/write/writeJSON';

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