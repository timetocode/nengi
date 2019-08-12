import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function writePong(bitStream, key) {
    if (key > -1) {
        bitStream[Binary[BinaryType.UInt8].write](Chunk.Pong)
        bitStream[Binary[BinaryType.UInt8].write](key)
    }
}

export default writePong;