import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function createTransferClientBuffer(transferKey, address) {
    var bits = 8
    bits += Binary[BinaryType.UTF8String].countBits(transferKey)
    bits += Binary[BinaryType.UTF8String].countBits(address)

    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream[Binary[BinaryType.UInt8].write](Chunk.TransferClient)
    Binary[BinaryType.UTF8String].write(bitStream, transferKey)
    Binary[BinaryType.UTF8String].write(bitStream, address)
    return bitBuffer
}

export default createTransferClientBuffer;
