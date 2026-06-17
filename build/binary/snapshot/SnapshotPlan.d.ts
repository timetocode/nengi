import { IEntity } from '../../common/IEntity';
import { ChannelHeader } from '../../common/ChannelHeader';
import { EntityChange, EntityUpdateGroup } from '../../common/binary/schema/util';
import { ResponseStatus } from '../../common/Endpoint';
import { EndpointPayload } from '../endpoint/EndpointPayload';
export type SnapshotResponse = {
    requestId: number;
    status: ResponseStatus;
    payload: EndpointPayload;
};
export type ChannelEntityCreate = {
    nid: number;
    channelId: number;
};
export type ChannelOpen = {
    channelId: number;
    header: ChannelHeader;
};
export type ChannelHeaderUpdate = {
    channelId: number;
    changes: EntityChange[];
    groups: EntityUpdateGroup[];
};
export type ChannelClose = {
    channelId: number;
    header?: ChannelHeader;
};
export type ChannelHeaderVersion = {
    channelId: number;
    version: number;
};
export type SnapshotChannel = {
    channelId: number;
    messages: any[];
    interpolatedMessages: any[];
    ecsCreateEntities: number[];
    ecsCreateComponents: IEntity[];
    ecsDeleteEntities: number[];
    createEntities: IEntity[];
    updateEntities: any[];
    updateEntityGroups: EntityUpdateGroup[];
    deleteEntities: number[];
};
export type SnapshotPlan = {
    engineMessages: any[];
    messages: any[];
    interpolatedMessages: any[];
    channels: SnapshotChannel[];
    responses: SnapshotResponse[];
    channelOpens: ChannelOpen[];
    channelEntityCreates: ChannelEntityCreate[];
    channelHeaderUpdates: ChannelHeaderUpdate[];
    channelCloses: ChannelClose[];
    channelHeaderVersions: ChannelHeaderVersion[];
    skipInterpolationNids: number[];
    ecsCreateEntities: number[];
    ecsCreateComponents: IEntity[];
    ecsDeleteEntities: number[];
    createEntities: IEntity[];
    updateEntities: EntityChange[];
    updateEntityGroups: EntityUpdateGroup[];
    deleteEntities: number[];
};
export declare function createEmptySnapshotPlan(): SnapshotPlan;
//# sourceMappingURL=SnapshotPlan.d.ts.map