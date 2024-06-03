import { Frame } from '../Frame';
declare class StateChange {
    predValue: any;
    authValue: any;
    deltaValue: any;
    tick: number;
    constructor(predValue: any, authValue: any, deltaValue: any, tick: number);
}
declare class PredictedEntity {
    state: Map<string, any>;
    changes: Map<string, any>;
    registerChange(prop: string, value: any, deltaValue: any): void;
}
declare class PredictionFrame {
    processed: boolean;
    entities: Map<number, PredictedEntity>;
    getOrCreateEntity(nid: number): PredictedEntity;
}
export declare class Predictor {
    predictionFrames: Map<number, PredictionFrame>;
    lastProcessedTick: number;
    bufferTicks: number;
    register(tick: number, nid: number, prop: string, value: any): void;
    process(frame: Frame): Map<number, Map<string, StateChange>>;
    cleanupOldFrames(): void;
    isPredicted(nid: number, prop: string, tick: number): boolean;
    getPendingPredictions(nid: number, startTick: number): Map<number, PredictedEntity>;
    reapplyPendingPredictions(nid: number, startTick: number, callback?: (prop: string, value: any) => void): void;
}
export {};
//# sourceMappingURL=Predictor.d.ts.map