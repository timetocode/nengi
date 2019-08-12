import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function readTransfer(bitStream) {
	return {
		transferKey: Binary[BinaryType.UTF8String].read(bitStream),
		address: Binary[BinaryType.UTF8String].read(bitStream)
	}

}

export default readTransfer;