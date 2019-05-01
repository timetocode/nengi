/**
* Definition of an Int4, a signed 4 bit integer
* range: -8 to 7
* uses BitBuffer functions for write/read
*/
import compareInts from './compare/compareIntegers';

var Int4 = {
    'min': -8,
    'max': 7,
    'bits': 4,
    'compare': compareInts,
    'write': 'writeInt4',
    'read': 'readInt4'
}

Int4.boundsCheck = function(value) {
	return value >= Int4.min && value <= Int4.max
}

export default Int4;