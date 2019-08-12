import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import readJSON from '../../protocol/read/readJSON.js';

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