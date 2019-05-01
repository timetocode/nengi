import Protocol from './Protocol';
//var config = require('../../config')


function CommandProtocol(schemaConfig, config) {
    schemaConfig[config.TYPE_PROPERTY_NAME] = {
        type: config.TYPE_BINARY_TYPE, 
        interp: false,
        isArray: false
    }

    var protocol = new Protocol(schemaConfig, config)
    protocol.type = 'Command'
    
    return protocol
}

export default CommandProtocol;
