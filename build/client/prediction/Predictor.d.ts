import { Schema } from '../../common/binary/schema/Schema';
import { Frame } from '../Frame';
import { PredictionErrorFrame } from './PredictionErrorFrame';
import { PredictionFrame } from './PredictionFrame';
declare class Predictor {
    predictionFrames: Map<number, PredictionFrame>;
    latestTick: number;
    generalPrediction: Map<number, Set<string>>;
    constructor();
    cleanUp(tick: number): void;
    addCustom(tick: number, entity: any, props: string[], nschema: Schema): void;
    add(tick: number, entity: any, props: string[], nschema: Schema): void;
    has(tick: number, nid: number, prop: string): boolean;
    getErrors(frame: Frame): PredictionErrorFrame;
}
export { Predictor };
