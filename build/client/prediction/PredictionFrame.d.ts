import { Schema } from '../../common/binary/schema/Schema';
import { PredictionEntity } from './PredictionEntity';
declare class PredictionFrame {
    tick: number;
    entityPredictions: Map<number, PredictionEntity>;
    constructor(tick: number);
    add(nid: number, entity: any, props: string[], nschema: Schema): void;
}
export { PredictionFrame };
//# sourceMappingURL=PredictionFrame.d.ts.map