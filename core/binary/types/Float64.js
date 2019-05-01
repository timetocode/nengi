/**
* Definition of an Float64
* uses BitBuffer functions for write/read
*/
import compareFloats from './compare/compareFloats';

var Float64 = {
    'bits': 64,
    'compare': compareFloats,
    'write': 'writeFloat64',
    'read': 'readFloat64'
}

Float64.boundsCheck = function(value) {
    return true //value >= Float32.min && value <= Float32.max
}

export default Float64;