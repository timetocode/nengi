import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function readTransferResponse(bitStream) {
	return {
		password: Binary[BinaryType.UTF8String].read(bitStream),
		approved: bitStream.readBoolean(),
		transferKey: Binary[BinaryType.UTF8String].read(bitStream)
	}
}

export default readTransferResponse;