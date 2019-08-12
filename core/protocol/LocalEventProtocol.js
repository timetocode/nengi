import Protocol from './Protocol.js';
//var config = require('../../config')


function LocalEventProtocol(schemaConfig, config) {
	//console.log(schemaConfig)
	schemaConfig[config.TYPE_PROPERTY_NAME] = {
		type: config.TYPE_BINARY_TYPE, 
		interp: false,
		isArray: false
	}

	if (typeof schemaConfig.x === 'undefined') {
		throw new Error('EventSchema must define x.')
	}

	if (typeof schemaConfig.y === 'undefined') {
		throw new Error('EventSchema must define y.')
	}

	var protocol = new Protocol(schemaConfig, config)
	protocol.type = 'LocalEvent'

	return protocol
}

export default LocalEventProtocol;
