import { IEntity } from '../common/IEntity';
import type { ChannelEntityCreate, ChannelClose, ChannelHeaderUpdate, ChannelOpen, SnapshotChannel } from '../binary/snapshot/SnapshotPlan';
export type Snapshot = {
    timestamp: number;
    confirmedClientTick: number;
    messages: any[];
    interpolatedMessages?: any[];
    channels?: SnapshotChannel[];
    channelOpens?: ChannelOpen[];
    channelEntityCreates?: ChannelEntityCreate[];
    channelHeaderUpdates?: ChannelHeaderUpdate[];
    channelCloses?: ChannelClose[];
    skipInterpolationNids?: number[];
    ecsCreateEntities?: number[];
    ecsCreateComponents?: IEntity[];
    ecsDeleteEntities?: number[];
    createEntities: IEntity[];
    updateEntities: any[];
    deleteEntities: number[];
};
//# sourceMappingURL=Snapshot.d.ts.map