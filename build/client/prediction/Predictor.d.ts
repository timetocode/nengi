import { Schema } from '../../common/binary/schema/Schema';
import { Frame } from '../Frame';
import { PredictionErrorFrame } from './PredictionErrorFrame';
import { PredictionFrame } from './PredictionFrame';
import { EntityStore } from '../EntityStore';
import { PredictionLog } from './PredictionLog';
import type { PredictionOperation, PredictionOperationOptions, PredictionResolution, PredictionTarget } from './PredictionLog';
export type PredictionStateMismatch = {
    operation: PredictionOperation;
    nid: number;
    prop: string;
    expected: any;
    authoritative: any;
};
export type PredictionReconciliationEvent = {
    frame: Frame;
    confirmedClientTick: number;
    store: EntityStore;
    target: PredictionTarget;
    authority: any;
    confirmed: PredictionOperation[];
    pending: PredictionOperation[];
    mismatches: PredictionStateMismatch[];
    dropConfirmed: () => void;
    dropPending: () => void;
};
type PredictionReconciliationHandler = (event: PredictionReconciliationEvent) => void;
declare class Predictor {
    predictionFrames: Map<number, PredictionFrame>;
    log: PredictionLog;
    latestTick: number;
    private reconciliationHandlers;
    constructor();
    cleanUp(tick: number): void;
    addCommand(command: any, tick: number, options?: PredictionOperationOptions): PredictionOperation<any>;
    addState(payload: any, tick: number, options?: PredictionOperationOptions): PredictionOperation<any>;
    onReconcile(handler: PredictionReconciliationHandler): () => void;
    addRequest<Response = any>(requestId: number, endpointId: number, payload: any, tick: number, options?: PredictionOperationOptions<Response>): PredictionOperation<Response>;
    resolveRequest<Response = any>(requestId: number, response: Response, frame?: Frame, store?: EntityStore): PredictionResolution<Response> | undefined;
    rejectRequest(requestId: number, error: any, frame?: Frame, store?: EntityStore): PredictionResolution<any> | undefined;
    resolveFrame(frame: Frame, store: EntityStore): PredictionResolution<any>[];
    addCustom(tick: number, entity: any, props: string[], nschema: Schema): void;
    add(tick: number, entity: any, props: string[], nschema: Schema): void;
    has(tick: number, nid: number, prop: string): boolean;
    getErrors(frame: Frame, entities: Map<number, any>): PredictionErrorFrame;
    private emitReconciliations;
    private collectMismatches;
}
export { Predictor };
export { PredictionLog, PredictionOperationKind, PredictionOperationStatus } from './PredictionLog';
export type { PredictionOperationOptions, PredictionTarget } from './PredictionLog';
//# sourceMappingURL=Predictor.d.ts.map