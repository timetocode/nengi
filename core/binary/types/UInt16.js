/**
* Definition of an UInt16, an unsigned 16 bit integer
* range: 0 to 65535
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers';

var UInt16 = {
    'min': 0,
    'max': 65535,
    'bits': 16,
    'compare': compareInts,
    'write': 'writeUInt16',
    'read': 'readUInt16'
}

UInt16.boundsCheck = function(value) {
	return value >= UInt16.min && value <= UInt16.max
}

export default UInt16;