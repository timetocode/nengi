import Binary from '../../binary/Binary';

var readProp = function(bitStream, type, arrayIndexType) {
    var binaryMeta = Binary[type]
    if (typeof arrayIndexType === 'number') {
        var arrayIndexMeta = Binary[arrayIndexType]
        var length = bitStream[arrayIndexMeta.read]()
 
        var arr = []
        for (var i = 0; i < length; i++) {
            if (binaryMeta.customRead) {
                var value = binaryMeta.read(bitStream)
                arr.push(value)
            } else {        
                var value = bitStream[binaryMeta.read]()               
                arr.push(value)
            } 
        }
        return arr
        
    } else {
        if (binaryMeta.customRead) {
            return binaryMeta.read(bitStream)
        } else { 
            return bitStream[binaryMeta.read]()
        } 
    }
}

export default readProp;