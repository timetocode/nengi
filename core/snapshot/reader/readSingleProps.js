import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import readSingle from '../../protocol/read/readSingle.js';
//var config = require('../../../config')

function readSingleProps(bitStream, protocolResolver, config) {

    // number of singleProps
    var length = bitStream[Binary[BinaryType.UInt16].read]()

    var singleProps = []
    for (var i = 0; i < length; i++) {
        // TODO is config needed here?
        var singleProp = readSingle(bitStream, protocolResolver, config)
        singleProps.push(singleProp)
    }
    return singleProps    
}

export default readSingleProps; 