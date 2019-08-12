import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import Binary from '../../binary/Binary.js';
import BinaryType from '../../binary/BinaryType.js';
import { Chunk } from '../Chunk.js';

function createHandshakeBuffer(handshake) {
	var json = JSON.stringify(handshake)

    var bits = 8
    bits += Binary[BinaryType.UTF8String].countBits(json)

    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream.writeUInt8(Chunk.Handshake)
    Binary[BinaryType.UTF8String].write(bitStream, json)

    return bitBuffer
}

export default createHandshakeBuffer;