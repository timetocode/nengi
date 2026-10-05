import { IEntity } from '../../common/IEntity'
import { ChannelHeader } from '../../common/ChannelHeader'
import { EntityChange, EntityUpdateGroup } from '../../common/binary/schema/util'
import { ResponseStatus } from '../../common/Endpoint'
import { EndpointPayload } from '../endpoint/EndpointPayload'

export type SnapshotResponse = {
    requestId: number,
    status: ResponseStatus,
    payload: EndpointPayload
}

export type ChannelOpen = {
    channelId: number
    header: ChannelHeader
}

export type ChannelHeaderUpdate = {
    channelId: number
    changes: readonly EntityChange[]
    groups: readonly EntityUpdateGroup[]
}

export type ChannelClose = {
    channelId: number
    header?: ChannelHeader
}

export type ChannelHeaderVersion = {
    channelId: number
    version: number
}

export type SnapshotChannel = {
    channelId: number
    messages: any[],
    interpolatedMessages: any[],
    ecsCreateEntities: number[],
    ecsCreateComponents: IEntity[],
    ecsDeleteEntities: number[],
    createEntities: IEntity[],
    updateEntities: any[],
    updateEntityGroups: EntityUpdateGroup[],
    deleteEntities: number[]
}

export type SnapshotPlan = {
    engineMessages: any[],
    messages: any[],
    interpolatedMessages: any[],
    channels: SnapshotChannel[],
    responses: SnapshotResponse[],
    channelOpens: ChannelOpen[],
    channelHeaderUpdates: ChannelHeaderUpdate[],
    channelCloses: ChannelClose[],
    channelHeaderVersions: ChannelHeaderVersion[],
    skipInterpolationNids: number[],
    ecsCreateEntities: number[],
    ecsCreateComponents: IEntity[],
    ecsDeleteEntities: number[],
    createEntities: IEntity[],
    updateEntities: EntityChange[],
    updateEntityGroups: EntityUpdateGroup[],
    deleteEntities: number[]
}

// Count/write/commit only read these collections. Builders keep their mutable
// SnapshotPlan; envelopes can borrow immutable empty sections instead.
export type ReadonlySnapshotPlan = {
    [Key in keyof SnapshotPlan]: Readonly<SnapshotPlan[Key]>
}

export const EMPTY_SNAPSHOT_ARRAY: readonly never[] = Object.freeze([])

export const EMPTY_SNAPSHOT_PLAN: ReadonlySnapshotPlan = Object.freeze({
    engineMessages: EMPTY_SNAPSHOT_ARRAY,
    messages: EMPTY_SNAPSHOT_ARRAY,
    interpolatedMessages: EMPTY_SNAPSHOT_ARRAY,
    channels: EMPTY_SNAPSHOT_ARRAY,
    responses: EMPTY_SNAPSHOT_ARRAY,
    channelOpens: EMPTY_SNAPSHOT_ARRAY,
    channelHeaderUpdates: EMPTY_SNAPSHOT_ARRAY,
    channelCloses: EMPTY_SNAPSHOT_ARRAY,
    channelHeaderVersions: EMPTY_SNAPSHOT_ARRAY,
    skipInterpolationNids: EMPTY_SNAPSHOT_ARRAY,
    ecsCreateEntities: EMPTY_SNAPSHOT_ARRAY,
    ecsCreateComponents: EMPTY_SNAPSHOT_ARRAY,
    ecsDeleteEntities: EMPTY_SNAPSHOT_ARRAY,
    createEntities: EMPTY_SNAPSHOT_ARRAY,
    updateEntities: EMPTY_SNAPSHOT_ARRAY,
    updateEntityGroups: EMPTY_SNAPSHOT_ARRAY,
    deleteEntities: EMPTY_SNAPSHOT_ARRAY
})

export function createEmptySnapshotPlan(): SnapshotPlan {
    return {
        engineMessages: [],
        messages: [],
        interpolatedMessages: [],
        channels: [],
        responses: [],
        channelOpens: [],
        channelHeaderUpdates: [],
        channelCloses: [],
        channelHeaderVersions: [],
        skipInterpolationNids: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        updateEntityGroups: [],
        deleteEntities: []
    }
}
