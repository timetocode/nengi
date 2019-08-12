/**
* Definition of an UInt11, an unsigned 11 bit integer
* range: 0 to 2047
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers.js';

var UInt11 = {
    'min': 0,
    'max': 2047,
    'bits': 11,
    'compare': compareInts,
    'write': 'writeUInt11',
    'read': 'readUInt11'
}

UInt11.boundsCheck = function(value) {
	return value >= UInt11.min && value <= UInt11.max
}

export default UInt11;