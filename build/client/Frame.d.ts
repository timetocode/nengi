import { IEntity } from '../common/IEntity';
import { Snapshot } from './Snapshot';
export interface IEntityFrame {
    createEntities: IEntity[];
    updateEntities: any[];
    deleteEntities: number[];
    from: number;
    to: number;
    fromConfirmed: number;
    toConfirmed: number;
}
export declare class Frame implements IEntityFrame {
    tick: number;
    confirmedClientTick: number;
    timestamp: number;
    processed: boolean;
    once: boolean;
    entities: Map<number, IEntity>;
    from: number;
    to: number;
    fromConfirmed: number;
    toConfirmed: number;
    createEntities: IEntity[];
    updateEntities: any[];
    deleteEntities: number[];
    constructor(tick: number, snapshot: Snapshot, previousFrame: Frame | null);
}
//# sourceMappingURL=Frame.d.ts.map