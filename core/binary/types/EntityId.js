/**
* Definition of an EntityId, an usigned 8 bit integer
* range: 0 to 255
* uses BitBuffer functions for write/read
*/
var EntityId = {
    'min': 0,
    'max': 255,
    'boundsCheck': boundsCheck,
    'bits': 8,
    'write': 'writeUInt8',
    'read': 'readUInt8'
}

var boundsCheck = function(value) {
	return value >= EntityId.min && value <= EntityId.max
}

export default EntityId;