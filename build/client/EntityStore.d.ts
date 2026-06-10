import { IEntity } from '../common/IEntity';
import { Context } from '../common/Context';
import { Frame } from './Frame';
import { Snapshot } from './Snapshot';
import { EntityHistory } from './EntityHistory';
export declare class EntityStore {
    context: Context;
    entities: Map<number, IEntity>;
    ntypes: Map<number, number>;
    channelHeaders: Map<number, IEntity>;
    entityChannels: Map<number, number>;
    ecsEntities: Set<number>;
    ecsComponentsByParent: Map<number, Set<number>>;
    ecsComponentParent: Map<number, number>;
    /**
     * Latest authoritative entities live in `entities`; history is only the
     * resolved past states needed by interpolation.
     */
    history: EntityHistory;
    constructor(context: Context);
    get(nid: number): IEntity | undefined;
    getByNType(ntype: number): IEntity[];
    getChannelId(nid: number): number | undefined;
    getChannelHeader(channelOrEntityNid: number): IEntity | undefined;
    getByChannel(channelId: number): IEntity[];
    getWhere(prop: string, value: any): IEntity[];
    applySnapshot(snapshot: Snapshot, tick: number, receivedAt?: number): Frame;
    private purgeChannel;
}
//# sourceMappingURL=EntityStore.d.ts.map