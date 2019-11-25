
var boundsCheck = function(value) {
    return value.length <= 4294967295
}

/**
* Serializes value and writes it to the buffer as an ascii string.
* The first byte will be the length of the string, and the subsequent
* bytes will be the character codes.
*/
var write = function(bitStream, byteArray) {
    for (var i = 0; i < byteArray.length; i++) {
        bitStream.writeUInt8(byteArray[i])
    }
}

var read = function(bitStream) {
    var length = bitStream.readUInt8()
    var array = [];
    for (var i = 0; i < length; i++) {
        array.push(bitStream.readUInt8())
    }
    return new Uint8Array(array)
}

var countBits = function(byteArray) {
  var bits = 8 // will represent the string length
  bits += byteArray.length * 8
  return bits
}

/**
* Definition of an ASCIIString, a string that using 1 byte per character
* the string may be up to 255 characters long
* uses BitBuffer UInt8 functions for write/read
*/
var ByteString = {
    'boundsCheck': boundsCheck,
    'customBits': true,
    'countBits' : countBits,
    'customWrite': true,
    'write': write,
    'customRead': true,
    'read': read
}

function compareByteStrings(a, b) {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}

ByteString.compare = function(a, b) {
    return {
        a: a,
        b: b,
        isChanged: !compareByteStrings(a,b)
    }
}

ByteString.compareFast = compareByteStrings;



export default ByteString;