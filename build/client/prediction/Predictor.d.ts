import { Schema } from '../../common/binary/schema/Schema';
import { Frame } from '../Frame';
import { PredictionErrorFrame } from './PredictionErrorFrame';
import { PredictionFrame } from './PredictionFrame';
declare class Predictor {
    predictionFrames: Map<number, PredictionFrame>;
    latestTick: number;
    predictionRange: Map<number, {
        start: number;
        end: number;
    }>;
    isTickPredictedForEntity(nid: number, tick: number): boolean;
    addCustom(tick: number, entity: any, props: string[], nschema: Schema): void;
    add(tick: number, entity: any, props: string[], nschema: Schema): void;
    has(tick: number, nid: number, prop: string): boolean;
    getErrors(frame: Frame): PredictionErrorFrame;
    cleanUp(tick: number): void;
}
export { Predictor };
//# sourceMappingURL=Predictor.d.ts.map