import Binary from '../../binary/Binary';
import BinaryType from '../../binary/BinaryType';

var writeProp = function(bitStream, type, arrayIndexType, value) {
    var binaryMeta = Binary[type]
    
    if (binaryMeta.customWrite) {
        binaryMeta.write(bitStream, value)
    } else {
        bitStream[binaryMeta.write](value)
    }    
}

export default writeProp;