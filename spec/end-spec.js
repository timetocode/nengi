require = require("esm")(module/*, options*/)
const nengi = require('..').default
const connectionMocker = require('./connectionMocker').default

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

describe('end to end mock, bot', () => {
    it('can create simple entities', () => {
        const mock = connectionMocker()
        const instance = new nengi.Instance(config, { mock })

        instance.onConnect((client, data, callback) => {
            callback({ accepted: true, text: 'Welcome!' })
        })

        const entity = new Entity(50, 50)
        instance.addEntity(entity)

        const entity2 = new Entity(60, 60)
        instance.addEntity(entity2)

        const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
        const bot = new nengi.Bot(config, protocolMap)

        bot.onConnect(response => { })
        bot.onClose(() => { })

        mock.mockConnect(bot, {})
        instance.update()
        
        // there first snapshot should contain a simple copy of both entities

        const snapshot = bot.readNetwork()
        const clEntity = snapshot.entities[0].createEntities[0]
        delete clEntity.protocol
        const clone = Object.assign({}, entity)

        expect(clEntity).toEqual(clone)  

        const clEntity2 = snapshot.entities[0].createEntities[1]
        delete clEntity2.protocol
        const clone2 = Object.assign({}, entity2)
        expect(clEntity2).toEqual(clone2)
    })
})

describe('end to end mock, client', () => {
    it('can create simple entities', () => {
        pending('using nengi.Bot instead, nengi.Client has too much Date math for automation')
        const mock = connectionMocker()
        const instance = new nengi.Instance(config, { mock })

        instance.onConnect((client, data, callback) => {
            callback({ accepted: true, text: 'Welcome!' })
        })

        const entity = new Entity(50, 50)
        instance.addEntity(entity)

        const entity2 = new Entity(60, 60)
        instance.addEntity(entity2)

        //const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
        const client = new nengi.Client(config)
        //client.update(100)

        client.onConnect(response => { })
        client.onClose(() => { })

        mock.mockConnect(client, {})
        instance.update()
        //client.update(1/60)
        instance.update()
        
        // there first snapshot should contain a simple copy of both entities
        //client.update()
        //const snapshot = client.readNetwork()

        //setInterval(() => {
        //   client.update(1/60)
            //console.log('time', client.chronus.averageTimeDifference)
        //    client.readNetwork()
            //console.log(client.readNetwork())
        //}, 1/60)

 
        /*
        const clEntity = snapshot.entities[0].createEntities[0]
        delete clEntity.protocol
        const clone = Object.assign({}, entity)

        expect(clEntity).toEqual(clone)  

        const clEntity2 = snapshot.entities[0].createEntities[1]
        delete clEntity2.protocol
        const clone2 = Object.assign({}, entity2)
        expect(clEntity2).toEqual(clone2)
        */
    })
})
