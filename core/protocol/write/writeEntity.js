import writeMessage from './message';

var writeEntity = function(bitStream, proxy, schema) {
	writeMessage(bitStream, proxy, schema)
}

export default writeEntity;