import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import readSingle from '../../protocol/read/readSingle';
//var config = require('../../../config')

function readSingleProps(bitStream, protocolResolver, config) {

    // number of singleProps
    var length = bitStream[Binary[BinaryType.UInt16].read]()

    var singleProps = new Array(length)
    for (var i = 0; i < length; i++) {
        // TODO is config needed here?
        var singleProp = readSingle(bitStream, protocolResolver, config)
        singleProps[i] = singleProp
    }
    return singleProps
}

export default readSingleProps;