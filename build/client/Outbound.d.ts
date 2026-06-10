import { NQueue } from '../NQueue';
type Tick = number;
type Command = any;
export type TimedCommandMetadata = {
    commandIndex: number;
    clientTimeMs: number;
    renderDelayMs: number;
    viewTick: number;
    viewServerTimeMs: number;
};
type ClientFrame = {
    tick: number;
    outboundCommands: NQueue<Command>;
    outboundEngineCommands: NQueue<Command>;
    unconfirmedCommands: NQueue<Command>;
};
export declare class Outbound {
    unconfirmedCommands: Map<Tick, Command[]>;
    outboundEngineCommands: Map<Tick, Command[]>;
    outboundCommands: Map<Tick, Command[]>;
    outboundCommandTiming: Map<Tick, TimedCommandMetadata[]>;
    tick: number;
    confirmedTick: number;
    lastSentTick: number;
    currentFrame: null | ClientFrame;
    constructor();
    getCurrentFrame(): {
        outboundEngineCommands: any[];
        outboundCommands: any[];
    };
    addEngineCommand(command: Command): void;
    addCommand(command: Command): void;
    addTimedCommand(command: Command, metadata: Omit<TimedCommandMetadata, 'commandIndex'>): void;
    getEngineCommands(tick: Tick): any[];
    getCommands(tick: Tick): any[];
    getCommandTiming(tick: Tick): any[];
    confirmCommands(confirmedTick: Tick): void;
    getUnconfirmedCommands(): Map<number, any[]>;
    flush(): void;
}
export {};
//# sourceMappingURL=Outbound.d.ts.map