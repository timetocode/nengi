import writeMessage from './message.js';

var writeEntity = function(bitStream, proxy, schema) {
	writeMessage(bitStream, proxy, schema)
}

export default writeEntity;