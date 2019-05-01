import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function readPong(bitStream) {
   return bitStream[Binary[BinaryType.UInt8].read]()
}

export default readPong;