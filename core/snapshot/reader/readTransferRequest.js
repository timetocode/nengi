import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function readTransferRequest(bitStream) {
	return {
		password: Binary[BinaryType.UTF8String].read(bitStream),
		data: JSON.parse(Binary[BinaryType.UTF8String].read(bitStream))
	}
}

export default readTransferRequest;