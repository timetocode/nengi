import { Schema } from '../../common/binary/schema/Schema';
import { EntityPrediction } from './EntityPrediction';
declare class PredictionFrame {
    tick: number;
    entityPredictions: Map<number, EntityPrediction>;
    constructor(tick: number);
    add(nid: number, entity: any, props: string[], nschema: Schema): void;
}
export { PredictionFrame };
