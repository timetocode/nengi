import createPropSchema from './createPropSchema';
import createOptSchema from './createOptSchema';
import selectUIntType from './selectUIntType';

function Protocol(schemaConfig, config, optSchemaConfig, components, throwOnAdvancedTypes) {
	//console.log('creating protocol from', schemaConfig, throwOnAdvancedTypes)
	this.metaType = 'protocol'
	this.type = 'basic'
	this.properties = {}
	this.keys = []
	
	this.hasOptimizations = false

	var arr = []
	if (schemaConfig[config.TYPE_PROPERTY_NAME]) {
		arr.push(config.TYPE_PROPERTY_NAME)
	}
	if (schemaConfig[config.ID_PROPERTY_NAME]) {
		arr.push(config.ID_PROPERTY_NAME)
	}

	for (var prop in schemaConfig) {
		if (prop !== config.TYPE_PROPERTY_NAME && prop !== config.ID_PROPERTY_NAME){
			arr.push(prop)
		}		
	}
	//arr.sort(propSort)

	this.keyType = selectUIntType(arr.length)
	
	for (var i = 0; i < arr.length; i++) {
		var prop = arr[i]

		var propConfig =  schemaConfig[prop]

		this.properties[prop] = createPropSchema(i, propConfig, throwOnAdvancedTypes)
		this.keys.push(prop)

		if (prop.indexOf('.') !== -1) {
			this.properties[prop].path = prop.split('.')
			if (this.properties[prop].path.length > 3) {
				throw new Error('Protocol nested property limit (3 maximum) exceeded by path ' + schemaConfig + ' ' + optSchemaConfig)
			}
		} else {
			this.properties[prop].path = [prop]
		}
	}

	if (typeof optSchemaConfig !== 'undefined') {
		var batch = {}
		batch.properties = {}
		batch.keys = []

		var arr2 = []
		for (var prop in optSchemaConfig) {
			arr2.push(prop)
		}

		for (var i = 0; i < arr2.length; i++) {
			var prop = arr2[i]

			var optConfig =  optSchemaConfig[prop]

			batch.properties[prop] = createOptSchema(i, optConfig)
			batch.keys.push(prop)

			if (prop.indexOf('.') !== -1) {
				batch.properties[prop].path = prop.split('.')
				if (batch.properties[prop].path.length > 3) {
					throw new Error('Protocol nested property limit (3 maximum) exceeded by path ' + schemaConfig + ' ' + optSchemaConfig)
				}
			} else {
				batch.properties[prop].path = [prop]
			}
		}
		this.hasOptimizations = true
		this.batch = batch
	}

	if (components) {
        this.components = {
            mode: components.mode
        }
    } else {
        this.components = false
    }

	//console.log(this)
}

export default Protocol;