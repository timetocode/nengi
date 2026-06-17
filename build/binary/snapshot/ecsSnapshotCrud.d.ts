import { SnapshotPlan } from './SnapshotPlan';
import { EcsSnapshotChannel } from './channelModes';
export declare function addEcsVisibilityCrud(plan: SnapshotPlan, channel: EcsSnapshotChannel, toCreate: number[], toDelete: number[]): void;
export declare function addEcsChannelEntityCreate(plan: SnapshotPlan, channel: {
    nid: number;
}, nid: number): void;
//# sourceMappingURL=ecsSnapshotCrud.d.ts.map