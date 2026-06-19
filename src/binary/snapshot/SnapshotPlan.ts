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
    changes: EntityChange[]
    groups: EntityUpdateGroup[]
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
