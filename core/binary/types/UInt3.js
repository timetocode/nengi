/**
* Definition of an UInt3, an unsigned 3 bit integer
* range: 0 to 7
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers.js';

var UInt3 = {
    'min': 0,
    'max': 7,
    'bits': 3,
    'compare': compareInts,
    'write': 'writeUInt3',
    'read': 'readUInt3'
}

UInt3.boundsCheck = function(value) {
	return value >= UInt3.min && value <= UInt3.max
}

export default UInt3;