import { IEntity } from '../common/IEntity';
export type AppliedEntityChange = {
    nid: number;
    prop: string;
    previous: any;
    value: any;
};
export type DeletedEntity = {
    nid: number;
    entity?: IEntity;
};
export interface IEntityFrame {
    tick: number;
    timestamp: number;
    createEntities: IEntity[];
    updateEntities: AppliedEntityChange[];
    deleteEntities: number[];
    deletedEntities: DeletedEntity[];
    messages: any[];
    confirmedClientTick: number;
}
export declare class Frame implements IEntityFrame {
    tick: number;
    confirmedClientTick: number;
    timestamp: number;
    createEntities: IEntity[];
    updateEntities: AppliedEntityChange[];
    deleteEntities: number[];
    deletedEntities: DeletedEntity[];
    messages: any[];
    constructor(args: IEntityFrame);
}
//# sourceMappingURL=Frame.d.ts.map