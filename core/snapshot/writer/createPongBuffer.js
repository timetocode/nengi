import BitBuffer from '../../binary/BitBuffer';
import BitStream from '../../binary/BitStream';
import { Chunk } from '../Chunk';
import countPongBits from './countPongBits';
import writePong from './writePong';

function createPongBuffer(pongKey) {
    var bits = 0
    bits += 8
    bits += 8

    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream.writeUInt8(Chunk.Pong)
    bitStream.writeUInt8(pongKey)


    return bitBuffer
}

export default createPongBuffer;