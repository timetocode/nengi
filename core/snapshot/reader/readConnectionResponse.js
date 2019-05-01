import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function readConnectionResponse(bitStream) {
	return {
		accepted: bitStream.readBoolean(),
		text: Binary[BinaryType.UTF8String].read(bitStream)
	}

}

export default readConnectionResponse;