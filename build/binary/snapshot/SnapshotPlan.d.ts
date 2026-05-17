import { IEntity } from '../../common/IEntity';
import { EntityChange } from '../../common/binary/schema/util';
import { ResponseStatus } from '../../common/Endpoint';
import { EndpointPayload } from '../endpoint/EndpointPayload';
export type SnapshotResponse = {
    requestId: number;
    status: ResponseStatus;
    payload: EndpointPayload;
};
export type SnapshotPlan = {
    engineMessages: any[];
    messages: any[];
    responses: SnapshotResponse[];
    createEntities: IEntity[];
    updateEntities: EntityChange[];
    deleteEntities: number[];
};
export declare function createEmptySnapshotPlan(): SnapshotPlan;
//# sourceMappingURL=SnapshotPlan.d.ts.map