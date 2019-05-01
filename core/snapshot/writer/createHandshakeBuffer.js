import BitBuffer from '../../binary/BitBuffer';
import BitStream from '../../binary/BitStream';
import Binary from '../../binary/Binary';
import BinaryType from '../../binary/BinaryType';
import { Chunk } from '../Chunk';

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