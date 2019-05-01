import utf8 from 'utf8';

var boundsCheck = function(value) {
    return value.length <= 4294967295
}

var write = function(bitStream, value) {
    var encoded = utf8.encode(value)
    bitStream.writeUInt32(encoded.length)
    for (var i = 0; i < encoded.length; i++) {
        bitStream.writeUInt8(encoded.charCodeAt(i))
    }
}

var read = function(bitStream) {
    var length = bitStream.readUInt32()
    var encoded = ''
    for (var i = 0; i < length; i++) {
        encoded += String.fromCharCode(bitStream.readUInt8())
    }
    return utf8.decode(encoded)
}

var countBits = function(string) {
    var bits = 32 // will represent the string length
    bits += utf8.encode(string).length * 8
    return bits
}

var UTF8String = {
    'boundsCheck': boundsCheck,
    'customBits': true,
    'countBits' : countBits,
    'customWrite': true,
    'write': write,
    'customRead': true,
    'read': read
}

UTF8String.compare = function(a, b) {
    return {
        a: a,
        b: b,
        isChanged: a !== b
    }
}

export default UTF8String;