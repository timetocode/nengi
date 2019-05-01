/**
* Definition of an UInt8, an usigned 8 bit integer
* range: 0 to 255
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers';

var UInt8 = {
    'min': 0,
    'max': 255,
    'bits': 8,
    'compare': compareInts,
    'write': 'writeUInt8',
    'read': 'readUInt8'
}

UInt8.boundsCheck = function(value) {
	return value >= UInt8.min && value <= UInt8.max
}

export default UInt8;