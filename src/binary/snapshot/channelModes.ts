import { Channel } from '../../server/Channel'
import { User } from '../../server/User'
import { EcsManualUpdateLog, ManualUpdateLog } from './manualUpdates'

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
}

export type ManualUpdateChannel = SharedUpdateChannel & {
    manualUpdateChannelMode: true
} & ManualUpdateLog

export type EcsSnapshotChannel = EcsManualUpdateLog & {
    ecsChannelMode: true
    nid: number
    clientIdentity?: any
    broadcastMessages: any[]
    createdRoots: number[]
    deletedRoots: number[]
    createdComponents: any[]
    deletedComponents: number[]
    rootDeletedComponents: number[]
    manualGroupNTypes: number[]
    getVisibleNetworkedNids(userId: number): number[]
    hasStructuralDeltas(): boolean
    isRootNid(nid: number): boolean
    isComponentNid(nid: number): boolean
    isRootDeletedComponentNid(nid: number): boolean
    getComponent(nid: number): any
}

export type EcsSpatialSnapshotChannel = EcsSnapshotChannel & {
    ecsSpatialChannelMode: true
    dirtyCells: Set<string>
    getVisibleCellKeys(userId: number): string[]
    getManualCellUpdateLog(cellKey: string): EcsManualUpdateLog | null
    cellHasManualUpdates(cellKey: string): boolean
    getMovedRoots(): { pid: number, fromCell: string, toCell: string }[]
    hasOnlyMovementDeltas(): boolean
    isCellVisible(userId: number, key: string): boolean
    getRootComponents(pid: number): any[]
}

export type ManualSpatialCellFragmentChannel = CellFragmentChannel & {
    manualSpatialChannelMode: true
    dirtyCells: Set<string>
    getManualCellUpdateLog(cellKey: string): ManualUpdateLog | null
    cellHasManualUpdates(cellKey: string): boolean
    getMovedRoots(): { entity: any, fromCell: string, toCell: string }[]
    hasStructuralDeltas(): boolean
}

export type SpatialCellChannel = {
    nid: number
    cellVisibilityMode: true
    membershipVersion: number
    fragmentCellLimit: number
    dirtyCells: Set<string>
    getVisibleCellKeys(userId: number): string[]
    getVisibleEntities(userId: number): number[]
    getCellEntities(key: string): any[]
    getUserViewVersion(userId: number): number
    getVisibleCellVersionSignature(userId: number): string
}

export type CellFragmentChannel = {
    nid: number
    clientIdentity?: any
    cellFragmentMode: true
    membershipVersion: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    getVisibleCellKeys(userId: number): string[]
    getVisibleEntities(userId: number): number[]
    getCellEntities(key: string): any[]
    getCellEntityNids(key: string): number[]
    getCellVersion(key: string): number
    getRememberedCellKeys(userId: number): string[]
    getRememberedCellNids(userId: number, key: string): number[]
    hasStableRememberedCells(userId: number): boolean
    getStableVisibleCellKeys(userId: number): string[] | null
    rememberVisibleCells(userId: number): void
    getMovedRoots(): { entity: any, fromCell: string, toCell: string }[]
    hasStructuralDeltas(): boolean
}

export function isSharedUpdateChannel(channel: any): channel is SharedUpdateChannel {
    return Array.isArray(channel.entityNids) &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.deltaBaseVersion === 'number' &&
        Array.isArray(channel.createdRoots) &&
        Array.isArray(channel.deletedNids) &&
        channel.entities?.array
}

export function isSharedMessageChannel(channel: any): channel is SharedMessageChannel {
    return Array.isArray(channel.broadcastMessages)
}

export function isManualUpdateChannel(channel: any): channel is ManualUpdateChannel {
    const candidate = channel as any
    return isSharedUpdateChannel(channel) &&
        candidate?.manualUpdateChannelMode === true &&
        Array.isArray(candidate.manualPropNids) &&
        Array.isArray(candidate.manualPropSchemas) &&
        Array.isArray(candidate.manualPropValues) &&
        Array.isArray(candidate.manualGroupNids) &&
        Array.isArray(candidate.manualGroupSchemas) &&
        Array.isArray(candidate.manualGroupValueOffsets) &&
        Array.isArray(candidate.manualGroupValues)
}

export function isEcsSnapshotChannel(channel: any): channel is EcsSnapshotChannel {
    const candidate = channel as any
    return candidate?.ecsChannelMode === true &&
        Array.isArray(candidate.manualPropNids) &&
        Array.isArray(candidate.manualPropSchemas) &&
        Array.isArray(candidate.manualPropValues) &&
        Array.isArray(candidate.manualGroupNids) &&
        Array.isArray(candidate.manualGroupSchemas) &&
        Array.isArray(candidate.manualGroupValueOffsets) &&
        Array.isArray(candidate.manualGroupValues) &&
        typeof candidate.getVisibleNetworkedNids === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function' &&
        typeof candidate.isRootNid === 'function' &&
        typeof candidate.isComponentNid === 'function' &&
        typeof candidate.isRootDeletedComponentNid === 'function' &&
        typeof candidate.getComponent === 'function'
}

export function getSingleEcsSnapshotChannel(user: User): EcsSnapshotChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isEcsSnapshotChannel(channel) ? channel : null
}

export function isEcsSpatialSnapshotChannel(channel: any): channel is EcsSpatialSnapshotChannel {
    const candidate = channel as any
    return isEcsSnapshotChannel(channel) &&
        candidate?.ecsSpatialChannelMode === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getVisibleCellKeys === 'function' &&
        typeof candidate.getManualCellUpdateLog === 'function' &&
        typeof candidate.cellHasManualUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasOnlyMovementDeltas === 'function' &&
        typeof candidate.isCellVisible === 'function' &&
        typeof candidate.getRootComponents === 'function'
}

export function getSingleEcsSpatialSnapshotChannel(user: User): EcsSpatialSnapshotChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isEcsSpatialSnapshotChannel(channel) ? channel : null
}

export function getEcsSnapshotChannels(user: User): EcsSnapshotChannel[] {
    const channels: EcsSnapshotChannel[] = []
    for (const channel of user.subscriptions.values()) {
        if (isEcsSnapshotChannel(channel)) {
            channels.push(channel)
        }
    }
    return channels
}

export function isSpatialCellChannel(channel: any): channel is SpatialCellChannel {
    return channel?.cellVisibilityMode === true &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.fragmentCellLimit === 'number' &&
        channel.dirtyCells instanceof Set &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.getCellEntities === 'function' &&
        typeof channel.getUserViewVersion === 'function' &&
        typeof channel.getVisibleCellVersionSignature === 'function'
}

export function isCellFragmentChannel(channel: any): channel is CellFragmentChannel {
    return channel?.cellFragmentMode === true &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.fragmentCellLimit === 'number' &&
        typeof channel.stableFragmentCellLimit === 'number' &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.getCellEntities === 'function' &&
        typeof channel.getCellEntityNids === 'function' &&
        typeof channel.getCellVersion === 'function' &&
        typeof channel.getRememberedCellKeys === 'function' &&
        typeof channel.getRememberedCellNids === 'function' &&
        typeof channel.hasStableRememberedCells === 'function' &&
        typeof channel.getStableVisibleCellKeys === 'function' &&
        typeof channel.rememberVisibleCells === 'function' &&
        typeof channel.getMovedRoots === 'function' &&
        typeof channel.hasStructuralDeltas === 'function'
}

export function isManualSpatialCellFragmentChannel(channel: any): channel is ManualSpatialCellFragmentChannel {
    const candidate = channel as any
    return isCellFragmentChannel(channel) &&
        candidate?.manualSpatialChannelMode === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getManualCellUpdateLog === 'function' &&
        typeof candidate.cellHasManualUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function'
}

export function getSingleSharedChannel(user: User): SharedUpdateChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isSharedUpdateChannel(channel) ? channel : null
}

export function getSingleManualUpdateChannel(user: User): ManualUpdateChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isManualUpdateChannel(channel) ? channel : null
}

export function getSingleSpatialCellChannel(user: User): SpatialCellChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isSpatialCellChannel(channel) ? channel : null
}

export function getSingleCellFragmentChannel(user: User): CellFragmentChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isCellFragmentChannel(channel) ? channel : null
}
