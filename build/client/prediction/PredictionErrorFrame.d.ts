import { PredictionErrorProperty } from './PredictionErrorProperty'
declare class PredictionErrorFrame {
    tick: number
    entities: Map<number, any>
    constructor(tick: number);
    add(nid: number, entity: any, predictionError: PredictionErrorProperty): void;
}
export { PredictionErrorFrame }
