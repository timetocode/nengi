import { IEntity } from '../../common/IEntity';
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
export type ChannelHeaderCreate = {
    channelId: number;
    header: IEntity;
    version: number;
};
export type ChannelHeaderUpdate = {
    channelId: number;
    changes: EntityChange[];
    groups: EntityUpdateGroup[];
    version: number;
};
export type ChannelHeaderDelete = {
    channelId: number;
    header?: IEntity;
};
export type ChannelHeaderVersion = {
    channelId: number;
    version: number;
};
export type SnapshotPlan = {
    engineMessages: any[];
    messages: any[];
    responses: SnapshotResponse[];
    channelEntityCreates: ChannelEntityCreate[];
    channelHeaderCreates: ChannelHeaderCreate[];
    channelHeaderUpdates: ChannelHeaderUpdate[];
    channelHeaderDeletes: ChannelHeaderDelete[];
    channelHeaderVersions: ChannelHeaderVersion[];
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