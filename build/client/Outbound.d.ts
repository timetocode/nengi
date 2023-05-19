import { NQueue } from '../NQueue';
type Tick = number;
type Command = any;
type ClientFrame = {
    tick: number;
    outboundCommands: NQueue<Command>;
    outboundEngineCommands: NQueue<Command>;
    unconfirmedCommands: NQueue<Command>;
};
declare class Outbound {
    unconfirmedCommands: Map<Tick, Command[]>;
    outboundEngineCommands: Map<Tick, Command[]>;
    outboundCommands: Map<Tick, Command[]>;
    frames: NQueue<ClientFrame>;
    tick: number;
    confirmedTick: number;
    lastSentTick: number;
    currentFrame: null | ClientFrame;
    constructor();
    getCurrentFrame(): {
        outboundEngineCommands: any[];
        outboundCommands: any[];
    };
    update(): void;
    beginFrame(tick?: number): void;
    addEngineCommand3(command: Command): void;
    addEngineCommand(command: Command): void;
    addCommand3(command: Command): void;
    addCommand(command: Command): void;
    getEngineCommands(tick: Tick): any[];
    getCommands(tick: Tick): any[];
    sendCommands(tick: Tick): void;
    confirmCommands(confirmedTick: Tick): void;
    getUnconfirmedCommands(): Map<number, any[]>;
}
export { Outbound };
