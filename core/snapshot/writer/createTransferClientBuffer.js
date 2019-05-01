import BitBuffer from '../../binary/BitBuffer';
import BitStream from '../../binary/BitStream';
import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

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
