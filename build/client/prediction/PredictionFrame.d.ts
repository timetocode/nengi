import { PredictionEntity } from './PredictionEntity';
declare class PredictionFrame {
    tick: number;
    entityPredictions: Map<number, PredictionEntity>;
    constructor(tick: number);
    add(nid: number, entity: any, props: string[]): void;
}
export { PredictionFrame };
//# sourceMappingURL=PredictionFrame.d.ts.map