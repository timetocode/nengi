/**
* Definition of an UInt7, an unsigned 7 bit integer
* range: 0 to 127
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers';

var UInt7 = {
    'min': 0,
    'max': 127,
    'bits': 7,
    'compare': compareInts,
    'write': 'writeUInt7',
    'read': 'readUInt7'
}

UInt7.boundsCheck = function(value) {
	return value >= UInt7.min && value <= UInt7.max
}

export default UInt7;