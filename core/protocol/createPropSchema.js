var createPropSchema = function(index, propConfig, throwOnAdvancedTypes) {
	var type = null
	var interp = false
	var isArray = false
	var arrayIndexType = null
	var protocol = null

	if (typeof propConfig === 'object') {
		/* 
		* Object syntactic sugar, for advanced config, example:
		* 'propName' : { type: nengi.UInt8, interp: false }
		*/

		// a subprotocol
		if (typeof propConfig.metaType !== 'undefined') {
			if (propConfig.metaType === 'protocol') {
				protocol = propConfig
				if (throwOnAdvancedTypes) {
					throw new Error('this protocol type does not support nested protocols; index: ' + index + '  propConfig: ' + propConfig)
				}
			}
		}

		type = propConfig.type
		
		// an array of subprotocols
		/*
		if (typeof type !== 'undefined') {
			if (typeof type.metaType !== 'undefined') {
				if (type.metaType === 'protocol') {
					protocol = propConfig.type
					if (throwOnAdvancedTypes) {
						throw new Error('this protocol type does not support nested protocols; index: ' + index + '  propConfig: ' + JSON.stringify(propConfig))
					}
				}
			}
		}
		*/
		
		// interpolation flag
		if (typeof propConfig.interp !== 'undefined') {
			interp = propConfig.interp
		}

		// an array of values
		if (typeof propConfig.indexType !== 'undefined') {
			if (typeof propConfig.type.prototype !== 'undefined') {
				// array of type protocol
				type = propConfig.type.prototype.protocol
				protocol = propConfig.type.prototype.protocol
				//console.log('array of subprotocols', propConfig)
			} else {
				// array of basic types (uint,int,bool,string, etc)
				//console.log('regular array', propConfig)
				type = propConfig.type
			}
			
			/*
			if (typeof propConfig.type === 'function') {
				// array of type protocol
				type = propConfig.type
				protocol = propConfig.type.prototype.protocol
				//console.log('array of subprotocols', propConfig)
			} else {
				// array of basic types (uint,int,bool,string, etc)
				//console.log('regular array', propConfig)
				type = propConfig.type
			}
			*/
			
			//console.log('ARRAY of values', propConfig, propConfig.type.prototype.protocol)
			isArray = true
			arrayIndexType = propConfig.indexType
			if (throwOnAdvancedTypes) {
				throw new Error('this protocol type does not support arrays; index: ' + index + '  propConfig: ' + propConfig)
			}
		}
	} else {
		/* 
		* Simple syntax, example:
		* 'propName' : nengi.UInt16
		*/
		type = propConfig
	}

	return { 
		key: index,
		protocol: protocol,
		type: type, 
		interp: interp, 
		isArray: isArray,
		arrayIndexType: arrayIndexType
	}
}

export default createPropSchema;