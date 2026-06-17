import { User } from '../../server/User';
import { SnapshotPlan } from './SnapshotPlan';
type ChannelMessageQueues = {
    nid: number;
    broadcastMessages?: any[];
    interpolatedBroadcastMessages?: any[];
};
export declare function addChannelMessages(plan: SnapshotPlan, user: User, channel: ChannelMessageQueues, includeBroadcastMessages: boolean): void;
export {};
//# sourceMappingURL=channelMessages.d.ts.map