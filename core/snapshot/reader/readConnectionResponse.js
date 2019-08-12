import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function readConnectionResponse(bitStream) {
	return {
		accepted: bitStream.readBoolean(),
		text: Binary[BinaryType.UTF8String].read(bitStream)
	}

}

export default readConnectionResponse;