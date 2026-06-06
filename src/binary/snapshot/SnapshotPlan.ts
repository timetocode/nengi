import { IEntity } from '../../common/IEntity'
import { EntityChange, EntityUpdateGroup } from '../../common/binary/schema/util'
import { ResponseStatus } from '../../common/Endpoint'
import { EndpointPayload } from '../endpoint/EndpointPayload'

export type SnapshotResponse = {
    requestId: number,
    status: ResponseStatus,
    payload: EndpointPayload
}

export type ChannelIdentity = {
    channelId: number,
    identity: any
}

export type ChannelEntityCreate = {
    nid: number,
    channelId: number
}

export type SnapshotPlan = {
    engineMessages: any[],
    messages: any[],
    responses: SnapshotResponse[],
    channelIdentities: ChannelIdentity[],
    channelEntityCreates: ChannelEntityCreate[],
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
        responses: [],
        channelIdentities: [],
        channelEntityCreates: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        updateEntityGroups: [],
        deleteEntities: []
    }
}
