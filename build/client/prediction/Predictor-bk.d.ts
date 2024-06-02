import { IEntity } from '../../common/IEntity';
import { Schema } from '../../common/binary/schema/Schema';
import { Frame } from '../Frame';
import { PredictionErrorFrame } from './PredictionErrorFrame';
import { PredictionFrame } from './PredictionFrame';
type tick = number;
type nid = number;
type TickRange = {
    start: tick;
    end: tick;
};
type DualState = {
    auth: any;
    pred: any;
};
type PropTickRanges = Map<prop, TickRange>;
type PropDualStates = Map<prop, DualState>;
type prop = string;
type PropertyMap2 = Map<prop, any>;
type MultiState2 = {
    authValue: any;
    predValue: any;
    deltaValue: any;
};
type PredictionResultMap2 = Map<prop, MultiState2>;
type PredictionEntity2 = {
    state: PropertyMap2;
    changes: PropertyMap2;
    multi: PredictionResultMap2;
};
type PredictionFrame2 = {
    processed: boolean;
    entities: Map<nid, PredictionEntity2>;
};
declare class Predictor {
    latestTick: number;
    predictionRange: Map<nid, PropTickRanges>;
    continuous: Map<tick, PredictionFrame>;
    discrete: Map<tick, PredictionFrame>;
    detached: Map<tick, PredictionFrame>;
    multiState: Map<nid, PropDualStates>;
    predictionFrames: Map<tick, PredictionFrame2>;
    register(tick: tick, nid: nid, prop: prop, value: any): void;
    process(frame: Frame): void;
    isPredicted(nid: number, prop: string, tick: number): boolean;
    isPredictedOld(nid: number, prop: string, tick: number): boolean;
    addDetached(tick: number, entity: IEntity, props: string[]): void;
    createOrUpdatePredictionRange(tick: number, entity: IEntity, props: string[]): void;
    addDiscrete(tick: number, entity: IEntity, props: string[]): void;
    addCustom(tick: number, entity: any, props: string[]): void;
    add(tick: number, entity: any, props: string[], nschema: Schema): void;
    has(tick: number, nid: number, prop: string): boolean;
    getMultistate(): {
        nid: nid;
        prop: prop;
        auth: any;
        pred: any;
    }[];
    getErrors(frame: Frame): PredictionErrorFrame;
    cleanUp(tick: number): void;
}
export { Predictor };
//# sourceMappingURL=Predictor-bk.d.ts.map