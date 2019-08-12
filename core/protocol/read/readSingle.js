import Binary from '../../binary/Binary.js';

//var config = require('../../../config')
import readProp from './readProp.js';

function readSingle(bitStream, protocolResolver, config) {    
    var id = bitStream[Binary[config.ID_BINARY_TYPE].read]()
    var protocol = protocolResolver(id)
    var propKey = bitStream[Binary[protocol.keyType].read]()
    var prop = protocol.keys[propKey]
    var propData = protocol.properties[prop]
    var value = readProp(bitStream, propData.type, propData.arrayIndexType)//bitStream[Binary[propData.type].read]()

    return {
        [config.ID_PROPERTY_NAME]: id,
        prop: prop,
        path: propData.path,
        value: value
    }
}

export default readSingle;
