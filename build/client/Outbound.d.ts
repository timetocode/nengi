import { NQueue } from '../NQueue'
type Tick = number;
type Command = any;
type ClientFrame = {
    tick: number;
    outboundCommands: NQueue<Command>;
    outboundEngineCommands: NQueue<Command>;
    unconfirmedCommands: NQueue<Command>;
};
declare class Outbound {
    unconfirmedCommands: Map<Tick, Command[]>
    outboundEngineCommands: Map<Tick, Command[]>
    outboundCommands: Map<Tick, Command[]>
    tick: number
    confirmedTick: number
    lastSentTick: number
    currentFrame: null | ClientFrame
    constructor();
    getCurrentFrame(): {
        outboundEngineCommands: any[];
        outboundCommands: any[];
    };
    addEngineCommand(command: Command): void;
    addCommand(command: Command): void;
    getEngineCommands(tick: Tick): any[];
    getCommands(tick: Tick): any[];
    confirmCommands(confirmedTick: Tick): void;
    getUnconfirmedCommands(): Map<number, any[]>;
}
export { Outbound }
