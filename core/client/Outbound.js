import createCommandBuffer from '../snapshot/writer/createCommandBuffer.js';

class Outbound {
    constructor(protocols, websocket, config) {
        this.config = config
        this.protocols = protocols
        this.websocket = websocket
        this.unconfirmedCommands = new Map()
        this.sendQueue = {}
        this.clientTick = 0
        this.confirmedTick = -1
        this.lastSentTick = -1
    }

    update() {
        for (var i = this.lastSentTick; i < this.clientTick; i++) {    
            this.sendCommands(i)
            this.lastSentTick = i
        }
        this.clientTick++

        //console.log('sq', this.sendQueue)
        //console.log('unconfirmed', this.unconfirmedCommands)
    }

    addCommand(command) {
        var tick = this.clientTick
        //command.tick = tick
        if (typeof this.sendQueue[tick] === 'undefined') {
            this.sendQueue[tick] = []        
        }
        if (!this.unconfirmedCommands.has(tick)) {
            this.unconfirmedCommands.set(tick, [])
        }
        command[this.config.TYPE_PROPERTY_NAME] = this.protocols.getIndex(command.protocol)
        this.sendQueue[tick].push(command)
        this.unconfirmedCommands.get(tick).push(command)
    }

    sendCommands(tick) {
        if (this.websocket && this.websocket.readyState === 1) {
            
            var commands = this.sendQueue[tick]
            if (!commands) {
                commands = []
            }
            this.websocket.send(createCommandBuffer(tick, commands).byteArray)
            delete this.sendQueue[tick]
        }
    }

    confirmCommands(tick){
        this.unconfirmedCommands.forEach((command, key) => {
            if (key <= tick) {
                this.unconfirmedCommands.delete(key)
            }
        })
        this.confirmedTick = tick
    }

    getUnconfirmedCommands() {
        return this.unconfirmedCommands
    }
}

export default Outbound;