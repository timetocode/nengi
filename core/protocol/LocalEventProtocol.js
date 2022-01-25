import Protocol from './Protocol';
//var config = require('../../config')


function LocalEventProtocol(schemaConfig, config) {
	//console.log(schemaConfig)
	schemaConfig[config.TYPE_PROPERTY_NAME] = {
		type: config.TYPE_BINARY_TYPE, 
		interp: false,
		isArray: false
	}

	var protocol = new Protocol(schemaConfig, config)
	protocol.type = 'LocalEvent'

	return protocol
}

export default LocalEventProtocol;
