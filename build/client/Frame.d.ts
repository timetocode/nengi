import { IEntity } from '../common/IEntity';
import type { ChannelEntityCreate, ChannelHeaderCreate, ChannelHeaderDelete, ChannelHeaderUpdate } from '../binary/snapshot/SnapshotPlan';
export type AppliedEntityChange = {
    nid: number;
    prop: string;
    previous: any;
    value: any;
};
export type DeletedEntity = {
    nid: number;
    entity?: IEntity;
    channelId?: number;
};
export type ClosedChannel = {
    channelId: number;
    header?: IEntity;
    entityNids: number[];
};
export interface IEntityFrame {
    tick: number;
    timestamp: number;
    receivedAt: number;
    ecsCreateEntities?: number[];
    ecsCreateComponents?: IEntity[];
    ecsDeleteEntities?: number[];
    channelEntityCreates?: ChannelEntityCreate[];
    channelHeaderCreates?: ChannelHeaderCreate[];
    channelHeaderUpdates?: ChannelHeaderUpdate[];
    channelHeaderDeletes?: ChannelHeaderDelete[];
    closedChannels?: ClosedChannel[];
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
    receivedAt: number;
    ecsCreateEntities: number[];
    ecsCreateComponents: IEntity[];
    ecsDeleteEntities: number[];
    channelEntityCreates: ChannelEntityCreate[];
    channelHeaderCreates: ChannelHeaderCreate[];
    channelHeaderUpdates: ChannelHeaderUpdate[];
    channelHeaderDeletes: ChannelHeaderDelete[];
    closedChannels: ClosedChannel[];
    createEntities: IEntity[];
    updateEntities: AppliedEntityChange[];
    deleteEntities: number[];
    deletedEntities: DeletedEntity[];
    messages: any[];
    constructor(args: IEntityFrame);
}
//# sourceMappingURL=Frame.d.ts.map