import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function readPong(bitStream) {
   return bitStream[Binary[BinaryType.UInt8].read]()
}

export default readPong;