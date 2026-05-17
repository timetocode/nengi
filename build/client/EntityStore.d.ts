import { IEntity } from '../common/IEntity';
import { Context } from '../common/Context';
import { Frame } from './Frame';
import { Snapshot } from './Snapshot';
export declare class EntityStore {
    context: Context;
    entities: Map<number, IEntity>;
    ntypes: Map<number, number>;
    constructor(context: Context);
    get(nid: number): IEntity | undefined;
    getByNType(ntype: number): IEntity[];
    getWhere(prop: string, value: any): IEntity[];
    applySnapshot(snapshot: Snapshot, tick: number): Frame;
}
//# sourceMappingURL=EntityStore.d.ts.map