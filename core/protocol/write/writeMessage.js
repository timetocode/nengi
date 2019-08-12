import Binary from '../../binary/Binary.js';
import writeProp from './writeProp.js';
import getValue from '../getValue.js';

var writeMessage = function(bitStream, proxy, protocol, initialPosition) {

    //console.log('writing message', proxy, protocol)
    var start = initialPosition || 0
    for (var i = 0; i < protocol.keys.length; i++) {
        var propName = protocol.keys[i]
        var propData = protocol.properties[propName]
        var value = getValue(proxy, propData.path) //proxy[propName]

        if (propData.protocol && propData.isArray) {
            //console.log('writing array of sub protocol')
	        var arrayIndexBinaryMeta = Binary[propData.arrayIndexType]
       		bitStream[arrayIndexBinaryMeta.write](value.length)
        	for (var j = 0; j < value.length; j++) {
    			writeMessage(bitStream, value[j], propData.protocol)
        	}        	
        } else if (propData.protocol) {
            //console.log('writing sub protocol')
        	writeMessage(bitStream, value, propData.protocol)
        } else if (propData.isArray) {
            //console.log('writing array')
            var arrayIndexBinaryMeta = Binary[propData.arrayIndexType]
            bitStream[arrayIndexBinaryMeta.write](value.length)
            for (var j = 0; j < value.length; j++) {
                writeProp(bitStream, propData.type, propData.arrayIndexType, value[j])
            }            
        } else {
            //console.log('writing regular prop', value, propData)
        	writeProp(bitStream, propData.type, propData.arrayIndexType, value)
        }
    }
}

export default writeMessage;