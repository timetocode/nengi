type Tick = number
type Command = any

export type CommandTimingMetadata = {
    commandIndex: number
    clientTimeMs: number
    renderDelayMs: number
    viewTick: number
    viewServerTimeMs: number
}

// used for the first frames, never has anything in it
const emptyArr: any[] = []

export class Outbound {
    outboundEngineCommands: Map<Tick, Command[]>
    outboundCommands: Map<Tick, Command[]>
    outboundCommandTiming: Map<Tick, CommandTimingMetadata[]>
    tick: number

    constructor() {
        this.outboundEngineCommands = new Map()
        this.outboundCommands = new Map()
        this.outboundCommandTiming = new Map()
        this.tick = 0
    }

    getCurrentFrame() {
        const outboundEngineCommands = this.outboundEngineCommands.get(this.tick)
        const outboundCommands = this.outboundCommands.get(this.tick)

        return {
            outboundEngineCommands: (outboundEngineCommands) ? outboundEngineCommands : emptyArr,
            outboundCommands: (outboundCommands) ? outboundCommands : emptyArr,
        }
    }

    addEngineCommand(command: Command) {
        const tick = this.tick
        if (this.outboundEngineCommands.has(tick)) {
            this.outboundEngineCommands.get(tick)!.push(command)
        } else {
            this.outboundEngineCommands.set(tick, [command])
        }
    }

    addCommand(command: Command) {
        const tick = this.tick
        const commands = this.outboundCommands.get(tick)
        if (commands) {
            return commands.push(command) - 1
        }
        this.outboundCommands.set(tick, [command])
        return 0
    }

    addCommandWithTiming(command: Command, metadata: Omit<CommandTimingMetadata, 'commandIndex'>) {
        const tick = this.tick
        const commandIndex = this.addCommand(command)
        const timing = this.outboundCommandTiming.get(tick)
        const entry = {
            commandIndex,
            clientTimeMs: metadata.clientTimeMs,
            renderDelayMs: metadata.renderDelayMs,
            viewTick: metadata.viewTick,
            viewServerTimeMs: metadata.viewServerTimeMs
        }
        if (timing) {
            timing.push(entry)
        } else {
            this.outboundCommandTiming.set(tick, [entry])
        }
        return commandIndex
    }

    getCommandTiming(tick: Tick) {
        if (this.outboundCommandTiming.has(tick)) {
            return this.outboundCommandTiming.get(tick)!
        } else {
            return emptyArr
        }
    }

    flush() {
        this.outboundEngineCommands.clear()
        this.outboundCommands.clear()
        this.outboundCommandTiming.clear()
    }
}
