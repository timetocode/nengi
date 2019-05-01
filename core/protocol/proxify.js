import getValue from './getValue';
import setValue from './setValue';

var proxify = function(obj, protocol) {

	//console.log(obj, protocol)
	var proxy = {}

	for (var i = 0; i < protocol.keys.length; i++) {
		//var value
		var prop = protocol.properties[protocol.keys[i]]
		var value = getValue(obj, prop.path)

		if (prop.isArray) {
			//console.log(prop.path, 'ARRAY_BASEd')

			if (prop.protocol) {
				// array of object references
				var temp = []
				for (var j = 0; j < value.length; j++) {
					temp.push(proxify(value[j],  prop.protocol))
				}
				value = temp
			} else {
				// array of simple values
				var temp = []
				for (var j = 0; j < value.length; j++) {
					temp.push(value[j])
				}
				value = temp
			}

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