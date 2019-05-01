import BitBuffer from '../../binary/BitBuffer';
import BitStream from '../../binary/BitStream';
import { Chunk } from '../Chunk';
import countCommandsBits from './countCommandsBits';
import writeCommands from './writeCommands';

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