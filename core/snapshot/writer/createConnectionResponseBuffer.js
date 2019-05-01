import BitBuffer from '../../binary/BitBuffer';
import BitStream from '../../binary/BitStream';
import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

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
