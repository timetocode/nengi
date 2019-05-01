var createOptSchema = function(index, optConfig) {
	var type = -1
	var delta = false

	if (typeof optConfig === 'object') {


		type = optConfig.type
	
		// interpolation flag
		if (typeof optConfig.delta !== 'undefined') {
			delta = optConfig.delta
		}


	} else {
		throw new Error('unknown schema optimization syntax; index: ' + index + ' optConfig: ' + optConfig)
	}

	return { 
		key: index,
		type: type, 
		delta: delta
	}
}

export default createOptSchema;