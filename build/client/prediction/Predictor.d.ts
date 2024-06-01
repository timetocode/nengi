import { IEntity } from '../../common/IEntity';
import { Schema } from '../../common/binary/schema/Schema';
import { Frame } from '../Frame';
import { PredictionErrorFrame } from './PredictionErrorFrame';
import { PredictionFrame } from './PredictionFrame';
type clientTick = number;
declare class Predictor {
    continuousPredictions: Map<number, PredictionFrame>;
    latestTick: number;
    predictionRange: Map<number, {
        start: number;
        end: number;
    }>;
    discretePredictions: Map<clientTick, PredictionFrame>;
    obliviousPredictions: Map<clientTick, PredictionFrame>;
    isTickPredictedForEntity(nid: number, tick: number): boolean;
    addOblivious(tick: number, entity: IEntity, props: string[]): void;
    addDiscrete(tick: number, entity: IEntity, props: string[]): void;
    addCustom(tick: number, entity: any, props: string[]): void;
    add(tick: number, entity: any, props: string[], nschema: Schema): void;
    has(tick: number, nid: number, prop: string): boolean;
    getErrors(frame: Frame): PredictionErrorFrame;
    cleanUp(tick: number): void;
}
export { Predictor };
//# sourceMappingURL=Predictor.d.ts.map