/**
* Definition of an UInt6, an unsigned 6 bit integer
* range: 0 to 63
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers';

var UInt6 = {
    'min': 0,
    'max': 63,
    'bits': 6,
    'compare': compareInts,
    'write': 'writeUInt6',
    'read': 'readUInt6'
}

UInt6.boundsCheck = function(value) {
	return value >= UInt6.min && value <= UInt6.max
}

export default UInt6;