/**
* Definition of a Boolean
* size is 1 bit
* uses BitBuffer functions for write/read
* should never be interpolated (what is halfway between true and false? so esoteric)
*/
var bool = {
    'bits': 1,
    'write': 'writeBoolean',
    'read': 'readBoolean'
    //'interp': 'never'
}

bool.boundsCheck = function(value) {
	return (typeof value === 'boolean')
}

bool.compare = function(a, b) {
    return {
        a: a,
        b: b,
        isChanged: a !== b
    }
}

export default bool;