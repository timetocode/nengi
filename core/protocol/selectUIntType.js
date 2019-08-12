import Type from '../binary/BinaryType.js';
import Binary from '../binary/Binary.js';

var UIntTypes = [
    Type.UInt2,
    Type.UInt3,
    Type.UInt4,
    Type.UInt5,
    Type.UInt6,
    Type.UInt7,
    Type.UInt8,
    Type.UInt9,
    Type.UInt10,
    Type.UInt11,
    Type.UInt12,
    Type.UInt16,
    Type.UInt32
]

var selectUIntType = function(max) {
    for (var i = 0; i < UIntTypes.length; i++) {
        var type = UIntTypes[i]
        if (Binary[type].max >= max) {
            return type
        }
    }

    throw new Error('selectUIntType max out of bounds')
}

export default selectUIntType;