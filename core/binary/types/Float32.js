/**
* Definition of an Float32
* uses BitBuffer functions for write/read
*/
import compareFloats from './compare/compareFloats';

var Float32 = {
    'bits': 32,
    'compare': compareFloats,
    'write': 'writeFloat32',
    'read': 'readFloat32'
}

Float32.boundsCheck = function(value) {
	return true //value >= Float32.min && value <= Float32.max
}

export default Float32;