import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import { Chunk } from '../Chunk.js';
import countCommandsBits from './countCommandsBits.js';
import writeCommands from './writeCommands.js';

function createCommandBuffer(tick, commands) {
    var bits = 0
    bits += 8
    bits += 32
    bits += countCommandsBits(commands)

    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream.writeUInt8(Chunk.ClientTick)
    bitStream.writeUInt32(tick)
    writeCommands(bitStream, commands)

    return bitBuffer
}

export default createCommandBuffer;