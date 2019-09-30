require = require("esm")(module/*, options*/)
const nengi = require('..').default
const EventEmitter = require('events').EventEmitter

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

class MockSocket extends EventEmitter {
    constructor() {
        super()
    }
    send(msg) {
        console.log('mock sending', msg)
    }
}

class MockWebSocketServer extends EventEmitter {
    constructor() {
        super()

    }

    acceptMockConnection() {
        const mockSock = new EventEmitter()
        //mockSock.
        this.emit('connection', )
    }

    send(msg) {
        console.log('mock sending', msg)
    }
}


fdescribe('end2end', () => {
    it('passes', () => {
        console.log('hello world')
        expect(true).toBe(true)
    })

    it('fancy', (done) => {

        const mockWebSocketServer = new EventEmitter()

        const instance = new nengi.Instance(config, { mockWebSocketServer })

        mockWebSocketServer.emit('connection', { on: (eventName, eventBody) => {
            console.log('yolo')
        } })
        
        instance.onConnect((client, data, callback) => {
            console.log(client, data)
            callback({ accepted: true, text: 'Welcome!' })
        })

        const entity = new Entity(50, 50)
        instance.addEntity(entity)

        /*
        const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
        const bot = new nengi.Bot(config, protocolMap)

        bot.onConnect(response => {
            console.log('Bot attempted connection, response:', response)
        })
    
        bot.onClose(() => {
            console.log('closed')
        })
    
        setTimeout(() => {
            console.log('trying to connect')
            bot.connect('ws://localhost:8079', {})

            instance.wsServer.close(() => { done() })
        }, 1000)
       */

        expect(true).toBe(true)

  
    })
})
