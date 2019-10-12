require = require("esm")(module/*, options*/)
const nengi = require('..').default

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


const protocolMap = new nengi.ProtocolMap(config, nengi.metaConfig)
const bot = new nengi.Bot(config, protocolMap)

bot.onConnect(response => {
    console.log('Bot attempted connection, response:', response)
})

bot.onClose(() => {
    console.log('closed')
})

console.log('trying to connect')
bot.connect('ws://localhost:8079', {})
