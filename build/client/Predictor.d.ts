import { Schema } from '../common/binary/schema/Schema'
import { Frame } from './Frame'
declare class PredictionErrorFrame {
    tick: number
    entities: Map<number, any>
    constructor(tick: number);
    add(nid: number, entity: any, predictionError: PredictionErrorProperty): void;
}
declare class PredictionErrorProperty {
    nid: number
    prop: string
    predictedValue: any
    actualValue: any
    constructor(nid: number, prop: string, predictedValue: any, actualValue: any);
}
declare class PredictionFrame {
    tick: number
    entityPredictions: Map<number, EntityPrediction>
    constructor(tick: number);
    add(nid: number, entity: any, props: string[], nschema: Schema): void;
}
declare class EntityPrediction {
    nid: number
    entity: any
    proxy: any
    props: string[]
    nschema: Schema
    constructor(nid: number, entity: any, props: string[], nschema: Schema);
}
declare class Predictor {
    predictionFrames: Map<number, PredictionFrame>
    latestTick: number
    constructor();
    cleanUp(tick: number): void;
    addCustom(tick: number, entity: any, props: string[], nschema: Schema): void;
    add(tick: number, entity: any, props: string[], nschema: Schema): void;
    has(tick: number, nid: number, prop: string): boolean;
    getErrors(frame: Frame): PredictionErrorFrame;
}
export { Predictor }
