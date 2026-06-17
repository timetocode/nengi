import { Client } from '../Client';
import type { PredictionOperation, PredictionOperationOptions } from './PredictionLog';
import type { PredictionReconciliationEvent } from './Predictor';
export type StateReplayCorrection<TState = any> = {
    replayed: number;
    state: TState;
    mismatches: number;
};
export type StateReplayPredictionOptions<TLocal = any, TAuthority = any, TState = any, TPayload = any> = {
    client: Client;
    nid: number | (() => number | null | undefined);
    getLocal: () => TLocal | undefined;
    getAuthoritative?: () => TAuthority | undefined;
    createReplayState?: (authority: TAuthority) => TState;
    applyPayload: (state: TLocal | TState, payload: TPayload) => void;
    applyReplayState?: (local: TLocal, replayState: TState) => void;
    affectedProps?: string[];
    expectedValues?: (local: TLocal, payload: TPayload) => Record<string, any> | undefined;
    predictionOptions?: Omit<PredictionOperationOptions, 'affected' | 'expected' | 'applyLocal'>;
    dropConfirmedOnReconcile?: boolean;
};
/**
 * State-change replay helper over PredictionLog. It predicts a local state
 * payload immediately, then rebuilds local state from latest authority plus
 * still-unconfirmed state payloads when the server confirms a client tick.
 */
export declare class StateReplayPrediction<TLocal = any, TAuthority = any, TState = any, TPayload = any> {
    private client;
    private nid;
    private getLocal;
    private getAuthoritative?;
    private createReplayState;
    private applyPayload;
    private applyReplayState;
    private affectedProps?;
    private expectedValues?;
    private predictionOptions?;
    private dropConfirmedOnReconcile;
    constructor(options: StateReplayPredictionOptions<TLocal, TAuthority, TState, TPayload>);
    predict(payload: TPayload, expectedValues?: Record<string, any>): PredictionOperation | undefined;
    reconcile(event?: PredictionReconciliationEvent): StateReplayCorrection<TState> | null;
    getPendingStateOperations(event?: PredictionReconciliationEvent): PredictionOperation<any>[];
    private getPendingByNid;
    private resolveNid;
    private getAuthoritativeFromStore;
}
//# sourceMappingURL=StateReplayPrediction.d.ts.map