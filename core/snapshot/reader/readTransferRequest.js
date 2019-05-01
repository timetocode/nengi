import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function readTransferRequest(bitStream) {
	return {
		password: Binary[BinaryType.UTF8String].read(bitStream),
		data: JSON.parse(Binary[BinaryType.UTF8String].read(bitStream))
	}
}

export default readTransferRequest;