import { NetworkEvent } from '../common/binary/NetworkEvent'
import type { INetworkEvent } from './InstanceNetwork'
import type { CommandTimingEstimate } from './User'
import type { User } from './User'

export type CommandRouterHandler<Command = any> = (args: {
    user: User
    command: Command
    event: INetworkEvent
    commandFrameNumber: number
    commandIndex: number
    timing?: CommandTimingEstimate
}) => void

export type CommandRouterUnhandledHandler = (args: {
    user: User
    command: any
    event: INetworkEvent
    commandFrameNumber: number
    commandIndex: number
    timing?: CommandTimingEstimate
}) => void

export class CommandRouter {
    private handlers = new Map<number, CommandRouterHandler[]>()
    private unhandled: CommandRouterUnhandledHandler | null = null

    on<Command = any>(ntype: number, handler: CommandRouterHandler<Command>) {
        const handlers = this.handlers.get(ntype) || []
        handlers.push(handler as CommandRouterHandler)
        this.handlers.set(ntype, handlers)
        return this
    }

    onUnhandled(handler: CommandRouterUnhandledHandler) {
        this.unhandled = handler
        return this
    }

    process(event: INetworkEvent) {
        if (event.type === NetworkEvent.CommandSet) {
            const commands = Array.isArray(event.commands) ? event.commands : []
            for (let i = 0; i < commands.length; i++) {
                this.processCommand(event.user, commands[i], event, event.commandFrameNumber ?? -1, i, event.commandTimings?.[i])
            }
            return commands.length
        }

        if (event.type === NetworkEvent.Command && event.commands) {
            this.processCommand(event.user, event.commands, event, event.commandFrameNumber ?? -1, 0, event.commandTimings?.[0])
            return 1
        }

        return 0
    }

    processCommand(user: User, command: any, event: INetworkEvent, commandFrameNumber = -1, commandIndex = 0, timing?: CommandTimingEstimate) {
        const ntype = command?.ntype
        const handlers = typeof ntype === 'number' ? this.handlers.get(ntype) : undefined
        if (!handlers || handlers.length === 0) {
            this.unhandled?.({ user, command, event, commandFrameNumber, commandIndex, timing })
            return false
        }

        for (let i = 0; i < handlers.length; i++) {
            handlers[i]({ user, command, event, commandFrameNumber, commandIndex, timing })
        }
        return true
    }
}
