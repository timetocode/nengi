import Binary from '../../binary/Binary.js';
import BinaryType from '../../binary/BinaryType.js';
import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import { Chunk } from '../Chunk.js';
import { ChunkReverse } from '../Chunk.js';
import readCommands from './readCommands.js';
import readPong from './readPong.js';
import readTransferRequest from './readTransferRequest.js';
import readTransferResponse from './readTransferResponse.js';

function readCommandBuffer(arrayBuffer, protocols, config) {
    //console.log(arrayBuffer)
    var bitBuffer = new BitBuffer(arrayBuffer)
    var bitStream = new BitStream(bitBuffer)

    var ret = {
        transferResponse: -1,
        transferRequest: -1,
        handshake: -1,
        tick: -1,
        pong: -1,
        commands: []
    }

    while (bitStream.offset + 16 <= bitBuffer.bitLength) {
        //console.log('while', bitStream.offset, bitBuffer.bitLength)
        var msgType = bitStream.readUInt8()
        //console.log('readcommandbuffer', msgType, ChunkReverse[msgType])

        switch (msgType) {
            case Chunk.Handshake:
                //console.log('HERE')
                ret.handshake = JSON.parse(Binary[BinaryType.UTF8String].read(bitStream))
                //console.log('handshake', ret.handshake)
               // if (!ret.handshake) {
                //    throw new Error('Invalid handshake')
                //}
                break
            case Chunk.ClientTick:
                ret.tick = bitStream.readUInt32()
                //console.log('clienttick', ret.tick)
                break
            case Chunk.Pong:
                ret.pong = bitStream.readUInt8()
                //console.log('pong', ret.pong)
                break
            case Chunk.Commands:
                ret.commands = readCommands(bitStream, protocols, config)
                //console.log('commands', ret.commands)
                break
            default:
                //console.log('unknown data from client')
                break
        }
    }

    return ret
}

export default readCommandBuffer;