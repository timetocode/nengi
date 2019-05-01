import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import readJSON from '../../protocol/read/readJSON';

function readJSONs(bitStream) {
    var length = bitStream[Binary[BinaryType.UInt16].read]()
    var jsons = []
    for (var i = 0; i < length; i++) {
        var json = readJSON(bitStream)
        jsons.push(json)        
    }
    return jsons
}

export default readJSONs;