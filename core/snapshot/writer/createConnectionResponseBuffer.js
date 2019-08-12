import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function createConnectionReponseBuffer(acceptConnection, text) {
    var bits = 8
    bits += 2
    bits += Binary[BinaryType.UTF8String].countBits(text)

    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream[Binary[BinaryType.UInt8].write](Chunk.ConnectionResponse)
    bitStream.writeBoolean(acceptConnection)
    Binary[BinaryType.UTF8String].write(bitStream, text)

    return bitBuffer
}

export default createConnectionReponseBuffer;
