
var boundsCheck = function(value) {
    return value.length < 256
}

/**
* Serializes value and writes it to the buffer as an ascii string.
* The first byte will be the length of the string, and the subsequent
* bytes will be the character codes.
*/
var write = function(bitStream, value) {
    var byteArray = convertASCIIStringToByteArray(value)

    for (var i = 0; i < byteArray.length; i++) {
        bitStream.writeUInt8(byteArray[i])
    }
}

var read = function(bitStream) {
    var length = bitStream.readUInt8()
    var string = ''
    for (var i = 0; i < length; i++) {
        string += String.fromCharCode(bitStream.readUInt8())
    }
    return string
}

var countBits = function(string) {
    var bits = 8 // will represent the string length
    bits += string.length * 8
    return bits
}

var convertASCIIStringToByteArray = function(string) {
    //console.log('convertASCIIStringToByteArray', string)
    var arr = []
    if (string.length < 256) {
        arr.push(string.length)
    } else {
        throw new Error('ASCIIString exceeded 255 character limit: ' + string)
    }
    for (var i = 0; i < string.length; i++) {
        arr.push(string.charCodeAt(i))
    }
    return arr
}

/**
* Definition of an ASCIIString, a string that using 1 byte per character
* the string may be up to 255 characters long
* uses BitBuffer UInt8 functions for write/read
*/
var ASCIIString = {
    'boundsCheck': boundsCheck,
    'customBits': true,
    'countBits' : countBits,
    'customWrite': true,
    'write': write,
    'customRead': true,
    'read': read
}

ASCIIString.compare = function(a, b) {
    return {
        a: a,
        b: b,
        isChanged: a !== b
    }
}



export default ASCIIString;