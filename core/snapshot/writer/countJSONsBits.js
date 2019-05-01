import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';
import countJSONBits from '../../protocol/countBits/countJSONBits';

function countJSONsBits(jsons) {
    var bits = 0
    if (jsons.length > 0) {
        bits += Binary[BinaryType.UInt8].bits
        bits += Binary[BinaryType.UInt16].bits
        jsons.forEach(json => {
            bits += countJSONBits(json)
        })
    }
    return bits
}

export default countJSONsBits;