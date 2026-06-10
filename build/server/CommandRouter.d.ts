import type { INetworkEvent } from './InstanceNetwork';
import type { CommandTimingEstimate } from './User';
import type { User } from './User';
export type CommandRouterHandler<Command = any> = (args: {
    user: User;
    command: Command;
    event: INetworkEvent;
    clientTick: number;
    timing?: CommandTimingEstimate;
}) => void;
export type CommandRouterUnhandledHandler = (args: {
    user: User;
    command: any;
    event: INetworkEvent;
    clientTick: number;
    timing?: CommandTimingEstimate;
}) => void;
export declare class CommandRouter {
    private handlers;
    private unhandled;
    on<Command = any>(ntype: number, handler: CommandRouterHandler<Command>): this;
    onUnhandled(handler: CommandRouterUnhandledHandler): this;
    process(event: INetworkEvent): number;
    processCommand(user: User, command: any, event: INetworkEvent, clientTick?: number, timing?: CommandTimingEstimate): boolean;
}
//# sourceMappingURL=CommandRouter.d.ts.map