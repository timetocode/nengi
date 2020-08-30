import getValue from './getValue';
import setValue from './setValue';

var proxify = function(obj, protocol) {

	//console.log('PROXIFY', obj, protocol)
	var proxy = {}

	for (var i = 0; i < protocol.keys.length; i++) {
		//var value
		var prop = protocol.properties[protocol.keys[i]]
		var value = getValue(obj, prop.path)
		//console.log('prop', prop, 'value', value)
		if (prop.isArray) {
			//console.log(prop.path, 'ARRAY_BASEd', prop)

			//console.log('AAAA', typeof prop.type)
			if (prop.protocol) {
				// array of object references
				//console.log('array of object references')
				var temp = new Array(value.length)
				for (var j = 0; j < value.length; j++) {
					//console.log('mm', value[j])
					temp[j] = proxify(value[j],  prop.protocol)
				}
				value = temp
			}
			// for arrays of primitive types, don't need to do anything

		} else {
			//console.log(prop.path, 'sub object NOT in array')
			if (typeof prop.protocol !== 'undefined') {
				if (prop.protocol !== null) {
					value = proxify(value, prop.protocol)
					//console.log('.:', value)
				}
			}
		}

        if (!value) {
            if (typeof value === 'undefined') {
                value = 0
            }
        }



		//console.log('r.:', value)
		setValue(proxy, prop.path, value)

		//console.log('SETTT', protocol.keys[i], value)
		//proxy[protocol.keys[i]] = value
	}
	//console.log('returning proxy', proxy)
	return proxy
}

export default proxify;