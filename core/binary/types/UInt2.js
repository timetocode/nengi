/**
* Definition of an UInt2, an unsigned 2 bit integer
* range: 0 to 3
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers';

var UInt2 = {
    'min': 0,
    'max': 3,
    'bits': 2,
    'compare': compareInts,
    'write': 'writeUInt2',
    'read': 'readUInt2'
}

UInt2.boundsCheck = function(value) {
	return value >= UInt2.min && value <= UInt2.max
}

export default UInt2;