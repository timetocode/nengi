import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import Binary from '../../binary/Binary.js';
import BinaryType from '../../binary/BinaryType.js';
import { Chunk } from '../Chunk.js';

function createTransferRequestBuffer(password, miscData) {
	var json = JSON.stringify(miscData)

    var bits = 8
    bits += Binary[BinaryType.UTF8String].countBits(password)
	bits += Binary[BinaryType.UTF8String].countBits(json)

    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream.writeUInt8(Chunk.TransferRequest)
    Binary[BinaryType.UTF8String].write(bitStream, password)
    Binary[BinaryType.UTF8String].write(bitStream, json)

    return bitBuffer
}

export default createTransferRequestBuffer;