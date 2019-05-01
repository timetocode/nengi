import utf8 from 'utf8';

var readJSON = function(bitStream) {
    var length = bitStream.readUInt32()
    var encoded = ''
    for (var i = 0; i < length; i++) {
        encoded += String.fromCharCode(bitStream.readUInt8())
    }
    return utf8.decode(encoded)
}

export default readJSON;