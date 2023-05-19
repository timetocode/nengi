import { NQueue } from '../NQueue'

type Tick = number
type Command = any

type ClientFrame = {
    tick: number,
    outboundCommands: NQueue<Command>
    outboundEngineCommands: NQueue<Command>
    unconfirmedCommands: NQueue<Command>
}

// used for the first frames, never has anything in it
const emptyArr: any[] = []

class Outbound {
    unconfirmedCommands: Map<Tick, Command[]>
    outboundEngineCommands: Map<Tick, Command[]>
    outboundCommands: Map<Tick, Command[]>
    frames: NQueue<ClientFrame>
    tick: number
    confirmedTick: number
    lastSentTick: number

    currentFrame: null | ClientFrame

    constructor() {
        this.unconfirmedCommands = new Map()
        this.outboundEngineCommands = new Map()
        this.outboundCommands = new Map()
        this.frames = new NQueue()
        this.tick = 0
        this.currentFrame = null
        this.confirmedTick = -1
        this.lastSentTick = -1
    }

    getCurrentFrame() {
        const outboundEngineCommands = this.outboundEngineCommands.get(this.tick)
        const outboundCommands = this.outboundCommands.get(this.tick)

        return {
            outboundEngineCommands: (outboundEngineCommands) ? outboundEngineCommands : emptyArr,
            outboundCommands: (outboundCommands) ? outboundCommands : emptyArr,
        }
    }

    update() {
        for (var i = this.lastSentTick + 1; i < this.tick; i++) {
            this.sendCommands(i)
            this.lastSentTick = i
        }
        this.tick++
    }

    beginFrame(tick: number = this.tick) {
        const clientFrame: ClientFrame = {
            tick,
            unconfirmedCommands: new NQueue<Command>(),
            outboundEngineCommands: new NQueue<Command>(),
            outboundCommands: new NQueue<Command>(),
        }
        this.frames.enqueue(clientFrame)
    }

    addEngineCommand3(command: Command) {
        if (!this.currentFrame) {
            throw new Error('Could not add commands before calling beginFrame')
        }
        this.currentFrame.outboundEngineCommands.enqueue(command)
    }

    addEngineCommand(command: Command) {
        const tick = this.tick
        if (this.outboundEngineCommands.has(tick)) {
            this.outboundEngineCommands.get(tick)!.push(command)
        } else {
            this.outboundEngineCommands.set(tick, [command])
        }
    }

    addCommand3(command: Command) {
        if (!this.currentFrame) {
            throw new Error('Could not add commands before calling beginFrame')
        }
        this.currentFrame.outboundCommands.enqueue(command)
        this.currentFrame.unconfirmedCommands.enqueue(command)
    }

    addCommand(command: Command) {
        const tick = this.tick
        if (this.outboundCommands.has(tick)) {
            this.outboundCommands.get(tick)!.push(command)
        } else {
            this.outboundCommands.set(tick, [command])
        }
        if (!this.unconfirmedCommands.has(tick)) {
            this.unconfirmedCommands.set(tick, [command])
        } else {
            this.unconfirmedCommands.get(tick)!.push(command)
        }
    }

    getEngineCommands(tick: Tick) {
        if (this.outboundEngineCommands.has(tick)) {
            return this.outboundEngineCommands.get(tick)!
        } else {
            return emptyArr
        }
    }

    getCommands(tick: Tick) {
        if (this.outboundCommands.has(tick)) {
            return this.outboundCommands.get(tick)!
        } else {
            return emptyArr
        }
    }

    sendCommands(tick: Tick) {
        /*
        if (this.websocket && this.websocket.readyState === 1) {
            if (this.sendQueue.has(tick)) {
                this.websocket.send(createCommandBuffer(tick, this.sendQueue.get(tick)).byteArray)
                this.sendQueue.delete(tick)
            } else {
                // TODO: Do we need to do this?
                this.websocket.send(createCommandBuffer(tick, []).byteArray)
            }
        }
        */
    }

    confirmCommands(confirmedTick: Tick) {
        this.unconfirmedCommands.forEach((commandQueue, tick) => {
            if (tick <= confirmedTick) {
                this.unconfirmedCommands.delete(tick)
            }
        })
        this.confirmedTick = confirmedTick
    }

    getUnconfirmedCommands() {
        return this.unconfirmedCommands
    }
}

export { Outbound }