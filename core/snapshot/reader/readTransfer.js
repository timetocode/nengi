import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function readTransfer(bitStream) {
	return {
		transferKey: Binary[BinaryType.UTF8String].read(bitStream),
		address: Binary[BinaryType.UTF8String].read(bitStream)
	}

}

export default readTransfer;