import { Channel } from '../../server/channel/Channel';
import { User } from '../../server/User';
import { EcsManualUpdateLog, ManualUpdateLog } from './manualUpdates';
import { ChannelHeader } from '../../common/ChannelHeader';
export type SharedUpdateChannel = Channel & {
    entityNids: number[];
    membershipVersion: number;
    deltaBaseVersion: number;
    createdRoots: any[];
    deletedNids: number[];
};
export type SharedMessageChannel = {
    nid: number;
    broadcastMessages: any[];
    interpolatedBroadcastMessages?: any[];
};
export type ManualUpdateChannel = SharedUpdateChannel & {
    manualUpdateChannelMode: true;
} & ManualUpdateLog;
export type EcsSnapshotChannel = EcsManualUpdateLog & {
    ecsChannelMode: true;
    nid: number;
    header: ChannelHeader;
    broadcastMessages: any[];
    interpolatedBroadcastMessages?: any[];
    createdRoots: number[];
    deletedRoots: number[];
    createdComponents: any[];
    deletedComponents: number[];
    rootDeletedComponents: number[];
    manualGroupNTypes: number[];
    getVisibleNetworkedNids(userId: number): number[];
    hasStructuralDeltas(): boolean;
    isRootNid(nid: number): boolean;
    isComponentNid(nid: number): boolean;
    isRootDeletedComponentNid(nid: number): boolean;
    getComponent(nid: number): any;
};
export type EcsSpatialSnapshotChannel = EcsSnapshotChannel & {
    ecsSpatialChannelMode: true;
    dirtyCells: Set<string>;
    getVisibleCellKeys(userId: number): string[];
    getManualCellUpdateLog(cellKey: string): EcsManualUpdateLog | null;
    cellHasManualUpdates(cellKey: string): boolean;
};
export type ManualSpatialCellFragmentChannel = CellFragmentChannel & {
    manualSpatialChannelMode: true;
    dirtyCells: Set<string>;
    getManualCellUpdateLog(cellKey: string): ManualUpdateLog | null;
    cellHasManualUpdates(cellKey: string): boolean;
    getMovedRoots(): {
        entity: any;
        fromCell: string;
        toCell: string;
    }[];
    hasStructuralDeltas(): boolean;
};
export type CellFragmentChannel = {
    nid: number;
    header: ChannelHeader;
    cellFragmentMode: true;
    membershipVersion: number;
    fragmentCellLimit: number;
    stableFragmentCellLimit: number;
    getVisibleCellKeys(userId: number): string[];
    getVisibleEntities(userId: number): number[];
    getCellEntities(key: string): any[];
    getCellEntityNids(key: string): number[];
    getCellVersion(key: string): number;
    getRememberedCellKeys(userId: number): string[];
    getRememberedCellNids(userId: number, key: string): number[];
    getStableVisibleCellKeys(userId: number): string[] | null;
    rememberVisibleCells(userId: number): void;
    getMovedRoots(): {
        entity: any;
        fromCell: string;
        toCell: string;
    }[];
    hasStructuralDeltas(): boolean;
};
export declare function isSharedUpdateChannel(channel: any): channel is SharedUpdateChannel;
export declare function isSharedMessageChannel(channel: any): channel is SharedMessageChannel;
export declare function isManualUpdateChannel(channel: any): channel is ManualUpdateChannel;
export declare function isEcsSnapshotChannel(channel: any): channel is EcsSnapshotChannel;
export declare function getSingleEcsSnapshotChannel(user: User): EcsSnapshotChannel | null;
export declare function isEcsSpatialSnapshotChannel(channel: any): channel is EcsSpatialSnapshotChannel;
export declare function getSingleEcsSpatialSnapshotChannel(user: User): EcsSpatialSnapshotChannel | null;
export declare function getEcsSnapshotChannels(user: User): EcsSnapshotChannel[];
export declare function isCellFragmentChannel(channel: any): channel is CellFragmentChannel;
export declare function isManualSpatialCellFragmentChannel(channel: any): channel is ManualSpatialCellFragmentChannel;
export declare function getSingleSharedChannel(user: User): SharedUpdateChannel | null;
export declare function getSingleManualUpdateChannel(user: User): ManualUpdateChannel | null;
export declare function getSingleCellFragmentChannel(user: User): CellFragmentChannel | null;
//# sourceMappingURL=channelModes.d.ts.map