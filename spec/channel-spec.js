
require = require("esm")(module/*, options*/)
const Protocol = require('../core/protocol/Protocol').default
var nengi = require('..').default


fdescribe('channel', function () {
	class Entity {
		constructor(x, y) {
			this.x = x
			this.y = y
		}
	}
	Entity.protocol = {
		x: nengi.Float32,
		y: nengi.Float32,
	}

	const config = {
		ID_BINARY_TYPE: nengi.UInt16,
		TYPE_BINARY_TYPE: nengi.UInt8,
		ID_PROPERTY_NAME: 'nid',
		TYPE_PROPERTY_NAME: 'ntype',
		protocols: {
			entities: [
				['Entity', Entity]
			]
		}
	}


	it('channel basics', function () {
		const instance = new nengi.Instance(config, { port: 8080 })
		const channel = new nengi.Channel(instance)
		instance.addChannel(channel)
		const entity = new Entity(50, 50)
		channel.addEntity(entity)
		
		//instance.addEntity(entity)

		console.log('diagnostic', 
			instance.entities.toArray().length,
			instance._entities.toArray().length,
			channel.entities.toArray().length
		)

		instance.wsServer.close()
	})

	it('channel basics2', function () {
		const instance = new nengi.Instance(config, { port: 8080 })
		const channel = new nengi.Channel(instance)

		const entity = new Entity(50, 50)
		channel.addEntity(entity)

		instance.addChannel(channel)
		
		//instance.addEntity(entity)

		console.log('diagnostic', 
			instance.entities.toArray().length,
			instance._entities.toArray().length,
			channel.entities.toArray().length
		)
	})
})