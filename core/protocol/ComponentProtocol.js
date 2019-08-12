import Protocol from './Protocol.js';
//var config = require('../../config')


function ComponentProtocol(schemaConfig, config, components) {
    schemaConfig[config.TYPE_PROPERTY_NAME] = {
        type: config.TYPE_BINARY_TYPE, 
        interp: false,
        isArray: false
    }

    schemaConfig[config.ID_PROPERTY_NAME] = {
        type: config.ID_BINARY_TYPE,
        interp: false,
        isArray: false
    }

    schemaConfig[config.PARENT_ID_PROPERTY_NAME] = {
        type: config.ID_BINARY_TYPE,
        interp: false,
        isArray: false
    }

    /*
    if (typeof schemaConfig.x === 'undefined') {
        throw new Error('EntitySchema must define x.')
    }

    if (typeof schemaConfig.y === 'undefined') {
        throw new Error('EntitySchema must define y.')
    }
    */

    var protocol = new Protocol(schemaConfig, config, null, components, true)
    protocol.type = 'Component'

    return protocol
}


export default ComponentProtocol;
