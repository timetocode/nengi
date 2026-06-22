import { Channel } from '../../server/channel/Channel'
import { EcsManualUpdateLog, ManualUpdateLog } from './manualUpdates'
import { ChannelHeader } from '../../common/ChannelHeader'

// Snapshot mode checks are intentionally structural. Channel classes expose a
// small set of hot-path marker fields and arrays, and the snapshot writer uses
// those fields to select the fastest binary path without importing every
// concrete channel class or relying on instanceof across package boundaries.
export type SharedUpdateChannel = Channel & {
    entityNids: number[]
    membershipVersion: number
    deltaBaseVersion: number
    createdRoots: any[]
    deletedNids: number[]
}

export type SharedMessageChannel = {
    nid: number
    broadcastMessages: any[]
    interpolatedBroadcastMessages?: any[]
}

export type EcsSnapshotChannel = EcsManualUpdateLog & {
    ecsChannelMode: true
    nid: number
    header: ChannelHeader
    broadcastMessages: any[]
    interpolatedBroadcastMessages?: any[]
    createdRoots: number[]
    deletedRoots: number[]
    createdComponents: any[]
    deletedComponents: number[]
    manualGroupNTypes: number[]
    getVisibleNetworkedNids(userId: number): number[]
    hasStructuralDeltas(): boolean
    isRootNid(nid: number): boolean
    isComponentNid(nid: number): boolean
    getComponent(nid: number): any
}

export type ManualCellFragmentChannel = CellFragmentChannel & {
    manualCellFragmentChannelMode: true
    dirtyCells: Set<string>
    getManualCellUpdateLog(cellKey: string): ManualUpdateLog | null
    cellHasManualUpdates(cellKey: string): boolean
    getMovedRoots(): { entity: any, fromCell: string, toCell: string }[]
    hasStructuralDeltas(): boolean
}

export type CellFragmentChannel = {
    nid: number
    header: ChannelHeader
    cellFragmentMode: true
    membershipVersion: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    getVisibleCellKeys(userId: number): string[]
    getVisibleEntities(userId: number): number[]
    getVisibleNetworkedNids(userId: number): number[]
    getCellEntities(key: string): any[]
    getCellEntityNids(key: string): number[]
    getCellVersion(key: string): number
    getRememberedCellKeys(userId: number): string[]
    getRememberedCellNids(userId: number, key: string): number[]
    collectSnapshotVisibility(userId: number): {
        toCreate: number[]
        toUpdate: number[]
        toDelete: number[]
        previous: Set<number>
    }
    getStableVisibleCellKeys(userId: number): string[] | null
    rememberVisibleCells(userId: number): void
    rememberSnapshotVisibility(userId: number): void
    getMovedRoots(): { entity: any, fromCell: string, toCell: string }[]
    hasStructuralDeltas(): boolean
}

export function isSharedMessageChannel(channel: any): channel is SharedMessageChannel {
    return channel?.cellFragmentMode !== true && Array.isArray(channel.broadcastMessages)
}

export function isCellFragmentChannel(channel: any): channel is CellFragmentChannel {
    return channel?.cellFragmentMode === true &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.fragmentCellLimit === 'number' &&
        typeof channel.stableFragmentCellLimit === 'number' &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.getVisibleNetworkedNids === 'function' &&
        typeof channel.getCellEntities === 'function' &&
        typeof channel.getCellEntityNids === 'function' &&
        typeof channel.getCellVersion === 'function' &&
        typeof channel.getRememberedCellKeys === 'function' &&
        typeof channel.getRememberedCellNids === 'function' &&
        typeof channel.collectSnapshotVisibility === 'function' &&
        typeof channel.getStableVisibleCellKeys === 'function' &&
        typeof channel.rememberVisibleCells === 'function' &&
        typeof channel.rememberSnapshotVisibility === 'function' &&
        typeof channel.getMovedRoots === 'function' &&
        typeof channel.hasStructuralDeltas === 'function'
}

export function isManualCellFragmentChannel(channel: any): channel is ManualCellFragmentChannel {
    const candidate = channel as any
    return isCellFragmentChannel(channel) &&
        candidate?.manualCellFragmentChannelMode === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getManualCellUpdateLog === 'function' &&
        typeof candidate.cellHasManualUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function'
}
