import { IEntity } from '../common/IEntity';
import { ChannelHeader } from '../common/ChannelHeader';
import type { ChannelClose, ChannelHeaderUpdate, ChannelOpen } from '../binary/snapshot/SnapshotPlan';
export type AppliedEntityChange = {
    nid: number;
    prop: string;
    previous: any;
    value: any;
};
export type DeletedEntity = {
    nid: number;
    entity: IEntity;
    channelId: number;
};
export type ClosedChannel = {
    channelId: number;
    header: ChannelHeader;
    entityNids: number[];
};
export type OpenedChannel = {
    channelId: number;
    header: ChannelHeader;
};
export type ChannelFrame = {
    channelId: number;
    ecsCreateEntities: number[];
    ecsCreateComponents: IEntity[];
    ecsDeleteEntities: number[];
    createEntities: IEntity[];
    updateEntities: AppliedEntityChange[];
    deleteEntities: number[];
    deletedEntities: DeletedEntity[];
    messages: any[];
    interpolatedMessages: any[];
};
export interface IEntityFrame {
    tick: number;
    timestamp: number;
    receivedAt: number;
    channelOpens?: ChannelOpen[];
    channelHeaderUpdates?: ChannelHeaderUpdate[];
    channelCloses?: ChannelClose[];
    skipInterpolationNids?: number[] | Set<number>;
    openedChannels?: OpenedChannel[];
    closedChannels?: ClosedChannel[];
    messages: any[];
    interpolatedMessages?: any[];
    channels?: ChannelFrame[];
    confirmedClientTick: number;
}
export declare class Frame implements IEntityFrame {
    tick: number;
    confirmedClientTick: number;
    timestamp: number;
    receivedAt: number;
    channelOpens: ChannelOpen[];
    channelHeaderUpdates: ChannelHeaderUpdate[];
    channelCloses: ChannelClose[];
    skipInterpolationNids: Set<number>;
    openedChannels: OpenedChannel[];
    closedChannels: ClosedChannel[];
    messages: any[];
    interpolatedMessages: any[];
    channels: ChannelFrame[];
    constructor(args: IEntityFrame);
    getChannel(channelId: number): ChannelFrame | undefined;
    requireChannel(channelId: number): ChannelFrame;
    hasChannel(channelId: number): boolean;
}
//# sourceMappingURL=Frame.d.ts.map