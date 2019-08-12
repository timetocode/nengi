/**
* Definition of an UInt10, an unsigned 10 bit integer
* range: 0 to 1023
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers.js';

var UInt10 = {
    'min': 0,
    'max': 1023,
    'bits': 10,
    'compare': compareInts,
    'write': 'writeUInt10',
    'read': 'readUInt10'
}

UInt10.boundsCheck = function(value) {
	return value >= UInt10.min && value <= UInt10.max
}

export default UInt10;