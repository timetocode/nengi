
require = require("esm")(module/*, options*/)
var nengi = require('..').default

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
    HIDE_LOGO: true,
    protocols: {
        entities: [
            ['Entity', Entity]
        ]
    }
}

describe('channel entity', () => {
    let instance
    let channel
    let entity

    beforeEach(() => {
        instance = new nengi.Instance(config, { port: 8080 })
        channel = instance.createChannel()
        entity = new Entity(50, 50)
        channel.addEntity(entity)
    })

    afterEach((done) => {
        instance.wsServer.close(() => { done() })
    })

    it('is not in the space', () => {
        expect(instance.entities.toArray().length).toBe(0)
    })

    it('is in the private _entities', () => {
        expect(instance._entities.toArray()[0]).toBe(entity)
    })
    
    it('is in the channel', () => {
        expect(channel.entities.toArray()[0]).toBe(entity)
    })

    it('can be removed', () => {
        channel.removeEntity(entity)
        expect(instance._entities.toArray().length).toBe(0)
        expect(channel.entities.toArray().length).toBe(0)
    })
})

// TODO client vision testing