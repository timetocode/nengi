import { IEntity } from '../common/IEntity';
import { Snapshot } from './Snapshot';
interface IEntityFrame {
    createEntities: IEntity[];
    updateEntities: any[];
    deleteEntities: number[];
}
declare class Frame implements IEntityFrame {
    tick: number;
    confirmedClientTick: number;
    timestamp: number;
    processed: boolean;
    entities: Map<number, IEntity>;
    createEntities: IEntity[];
    updateEntities: any[];
    deleteEntities: number[];
    constructor(snapshot: Snapshot, previousFrame: Frame | null);
}
export { Frame, IEntityFrame };
//# sourceMappingURL=Frame.d.ts.map