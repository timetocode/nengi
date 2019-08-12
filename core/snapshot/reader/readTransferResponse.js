import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function readTransferResponse(bitStream) {
	return {
		password: Binary[BinaryType.UTF8String].read(bitStream),
		approved: bitStream.readBoolean(),
		transferKey: Binary[BinaryType.UTF8String].read(bitStream)
	}
}

export default readTransferResponse;