import { Instance } from '../../server/Instance';
import { SnapshotPlan } from './SnapshotPlan';
import { CellFragmentChannel, SharedUpdateChannel } from './channelModes';
export declare function collectChannelUpdatePlan(instance: Instance, channel: SharedUpdateChannel, excludedNids?: Set<number>): SnapshotPlan;
export declare function collectSpatialCellUpdatePlan(instance: Instance, channel: CellFragmentChannel, cellKey: string): SnapshotPlan;
export declare function collectEntityUpdatePlan(instance: Instance, entity: any, plan: SnapshotPlan): void;
export declare function collectCreateEntitiesForRoots(instance: Instance, roots: any[]): {
    createEntities: any[];
    nids: Set<number>;
};
export declare function collectNidsForRoots(instance: Instance, roots: any[]): Set<number>;
export declare function addRegularCreate(plan: SnapshotPlan, instance: Instance, nid: number): void;
export declare function addRegularUpdate(plan: SnapshotPlan, instance: Instance, nid: number): void;
//# sourceMappingURL=entitySnapshotPlans.d.ts.map