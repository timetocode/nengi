import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function writePong(bitStream, key) {
    if (key > -1) {
        bitStream[Binary[BinaryType.UInt8].write](Chunk.Pong)
        bitStream[Binary[BinaryType.UInt8].write](key)
    }
}

export default writePong;