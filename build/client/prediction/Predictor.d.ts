import { Frame } from '../Frame';
type tick = number;
type nid = number;
type prop = string;
type PropMap = Map<prop, any>;
type PredictedEntity = {
    state: PropMap;
    changes: PropMap;
};
type PredictedFrame = {
    processed: boolean;
    entities: Map<nid, PredictedEntity>;
};
type StateBufferEntry = {
    predValue: any;
    authValue: any;
    deltaValue: any;
    tick: tick;
};
export declare class Predictor {
    predictionFrames: Map<tick, PredictedFrame>;
    register(tick: tick, nid: nid, prop: prop, value: any): void;
    process(frame: Frame): Map<number, Map<string, StateBufferEntry>>;
    isPredicted(nid: number, prop: string, tick: number): boolean;
    getPendingPredictions(nid: number, startTick: number): Map<tick, PredictedEntity>;
    reapplyPendingPredictions(nid: number, startTick: number, callback?: (prop: string, value: any) => void): void;
}
export {};
//# sourceMappingURL=Predictor.d.ts.map