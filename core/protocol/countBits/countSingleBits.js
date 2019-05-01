import Binary from '../../binary/Binary';
import countPropBits from './countPropBits';

function countBits(single) {  
    var bits = Binary[single.idType].bits
    bits += Binary[single.keyType].bits
    //bits += Binary[single.valueType].bits
    bits += countPropBits(single.valueType, undefined, single.value)
    return bits
}

export default countBits;