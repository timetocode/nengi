import { PredictionErrorProperty } from './PredictionErrorProperty'
declare class PredictionErrorEntity {
    nid: number
    proxy: any
    errors: PredictionErrorProperty[]
    constructor(nid: number, entity: any);
    add(predictionError: PredictionErrorProperty): void;
}
export { PredictionErrorEntity }
