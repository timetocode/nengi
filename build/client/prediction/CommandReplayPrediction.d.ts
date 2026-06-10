import { Client } from '../Client';
import type { TimedCommandOptions } from '../ClientNetwork';
import type { PredictionOperation, PredictionOperationOptions } from './PredictionLog';
export type CommandReplayCorrection<TState = any> = {
    corrected: boolean;
    error: number;
    replayed: number;
    state: TState;
};
export type CommandReplayPredictionOptions<TLocal = any, TAuthority = any, TState = any, TCommand = any> = {
    client: Client;
    nid: number | (() => number | null | undefined);
    getLocal: () => TLocal | undefined;
    getAuthoritative: () => TAuthority | undefined;
    createReplayState?: (authority: TAuthority) => TState;
    applyCommand: (state: TLocal | TState, command: TCommand) => void;
    applyReplayState?: (local: TLocal, replayState: TState) => void;
    measureError?: (local: TLocal, replayState: TState) => number;
    shouldCorrect?: (error: number, context: {
        local: TLocal;
        replayState: TState;
        authoritative: TAuthority;
    }) => boolean;
    affectedProps?: string[];
    predictionOptions?: Omit<PredictionOperationOptions, 'affected' | 'applyLocal'>;
    timingOptions?: TimedCommandOptions | ((command: TCommand) => TimedCommandOptions);
};
/**
 * Small movement-style helper over PredictionLog. It predicts commands
 * immediately, then rebuilds local state from latest authority plus still
 * unconfirmed commands when the server confirms a client tick.
 */
export declare class CommandReplayPrediction<TLocal = any, TAuthority = any, TState = any, TCommand = any> {
    private client;
    private nid;
    private getLocal;
    private getAuthoritative;
    private createReplayState;
    private applyCommand;
    private applyReplayState;
    private measureError;
    private shouldCorrect;
    private affectedProps?;
    private predictionOptions?;
    private timingOptions?;
    constructor(options: CommandReplayPredictionOptions<TLocal, TAuthority, TState, TCommand>);
    predict(command: TCommand): PredictionOperation | undefined;
    reconcile(): CommandReplayCorrection<TState> | null;
    getPendingCommands(): PredictionOperation<any>[];
    private resolveNid;
}
//# sourceMappingURL=CommandReplayPrediction.d.ts.map