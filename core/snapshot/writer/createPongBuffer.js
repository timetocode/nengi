import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import { Chunk } from '../Chunk.js';
import countPongBits from './countPongBits.js';
import writePong from './writePong.js';

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