import Binary from '../../binary/Binary';
import readProp from './readProp';
import setValue from '../setValue';

var readMessage = function(bitStream, protocol, initialPosition, type, typePropertyName) {
    var start = 0

    var proxy = {}
    if (initialPosition) {

        start = initialPosition
        //proxy.push(type)
        proxy[typePropertyName] = type
    }

    for (var i = start; i < protocol.keys.length; i++) {
        var propName = protocol.keys[i]
        var propData = protocol.properties[propName]

        if (propData.protocol && propData.isArray) {
            var arrayIndexBinaryMeta = Binary[propData.arrayIndexType]
            var length = bitStream[arrayIndexBinaryMeta.read]()
            var temp = []
            for (var j = 0; j < length; j++) {
                temp.push(readMessage(bitStream, propData.protocol))
            }
            value = temp

        } else if (propData.protocol) {
            var value = readMessage(bitStream, propData.protocol)//, propData.protocol)
        } else {
            var value = readProp(bitStream, propData.type, propData.arrayIndexType)
        }
        setValue(proxy, propData.path, value)
        //proxy[propName] = value
    }
    return proxy
}

export default readMessage;