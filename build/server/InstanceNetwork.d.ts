import { Instance } from './Instance';
import { NetworkEvent } from '../common/binary/NetworkEvent';
import { User } from './User';
import type { CommandTimingEstimate } from './User';
import { EngineMessage } from '../common/EngineMessage';
import { BinaryPayload } from '../common/binary/BinaryAdapter';
import { ProtocolConfig } from '../common/binary/Protocol';
import type { ResponseEndpoint } from './Instance';
import { NQueue } from '../NQueue';
export interface INetworkEvent {
    type: NetworkEvent;
    user: User;
    commands?: any;
    clientTick?: number;
    commandTimings?: Array<CommandTimingEstimate | undefined>;
    serverReceivedTimeMs?: number;
    payload?: any;
}
export interface INetworkRequest {
    user: User;
    requestId: number;
    endpointId: number;
    endpoint?: ResponseEndpoint;
    body?: any;
}
export type ResponseBacklogInfo = {
    user: User;
    queued: number;
    sent: number;
    remaining: number;
    tick: number;
};
export type SnapshotPerformanceSample = {
    collectMs: number;
    countMs: number;
    writeMs: number;
    commitMs: number;
    sendMs: number;
    bytes: number;
    creates: number;
    updateProps: number;
    updateGroups: number;
    groupedUpdateProps: number;
    deletes: number;
    messages: number;
    engineMessages: number;
    responses: number;
};
export type SnapshotPerformanceWindow = {
    snapshots: number;
    sharedSnapshots: number;
    collectTotalMs: number;
    collectMaxMs: number;
    countTotalMs: number;
    countMaxMs: number;
    writeTotalMs: number;
    writeMaxMs: number;
    commitTotalMs: number;
    commitMaxMs: number;
    sendTotalMs: number;
    sendMaxMs: number;
    bytesTotal: number;
    bytesMax: number;
    createsTotal: number;
    updatePropsTotal: number;
    updateGroupsTotal: number;
    groupedUpdatePropsTotal: number;
    deletesTotal: number;
    messagesTotal: number;
    messagesMax: number;
    engineMessagesTotal: number;
    engineMessagesMax: number;
    responsesTotal: number;
    responsesMax: number;
    sharedMessageFragmentBuilds: number;
    sharedMessageFragmentHits: number;
    sharedMessageFragmentCountTotalMs: number;
    sharedMessageFragmentCountMaxMs: number;
    sharedMessageFragmentWriteTotalMs: number;
    sharedMessageFragmentWriteMaxMs: number;
    sharedMessageFragmentBytesTotal: number;
    sharedMessageFragmentBytesMax: number;
    sharedMessageFragmentCopyTotalMs: number;
    sharedMessageFragmentCopyMaxMs: number;
    sharedMessageFragmentCopyBytesTotal: number;
    sharedMessageFragmentMessagesTotal: number;
    sharedFragmentBuilds: number;
    sharedFragmentHits: number;
    sharedFragmentCollectTotalMs: number;
    sharedFragmentCollectMaxMs: number;
    sharedFragmentCountTotalMs: number;
    sharedFragmentCountMaxMs: number;
    sharedFragmentWriteTotalMs: number;
    sharedFragmentWriteMaxMs: number;
    sharedFragmentBytesTotal: number;
    sharedFragmentBytesMax: number;
    sharedFragmentCopyTotalMs: number;
    sharedFragmentCopyMaxMs: number;
    sharedFragmentCopyBytesTotal: number;
};
export type SharedSnapshotFragment = {
    payload: BinaryPayload;
    bytes: number;
    updateProps: number;
    updateGroups: number;
    groupedUpdateProps: number;
};
export type SharedMessageFragment = {
    payload: BinaryPayload;
    bytes: number;
    messages: number;
};
export type SharedCreateFragment = {
    payload: BinaryPayload;
    bytes: number;
    creates: number;
    nids: Set<number>;
};
export type SharedDeleteFragment = {
    payload: BinaryPayload;
    bytes: number;
    deletes: number;
    nids: Set<number>;
};
export declare class InstanceNetwork {
    instance: Instance;
    responseBacklogUsers: Set<User>;
    requestQueue: NQueue<INetworkRequest>;
    requireSchemaFingerprint: boolean;
    debugBinaryWrites: boolean;
    sharedUpdateFragmentsEnabled: boolean;
    sharedUpdateFragments: Map<string, SharedSnapshotFragment>;
    sharedCreateFragments: Map<string, SharedCreateFragment>;
    sharedDeleteFragments: Map<string, SharedDeleteFragment>;
    sharedMessageFragments: Map<string, SharedMessageFragment>;
    /**
     * Disabled by default because each sample takes several high-resolution
     * clock reads per user. The fields intentionally mirror the snapshot
     * pipeline so stress tests can tell whether time is going to visibility
     * and plan collection, exact byte counting, binary writing, commit work,
     * or the adapter send call.
     */
    snapshotPerformanceEnabled: boolean;
    snapshotPerformance: SnapshotPerformanceWindow;
    onResponseBacklog: (info: ResponseBacklogInfo) => void;
    constructor(instance: Instance);
    onRequest(): void;
    recordSnapshotPerformance(sample: SnapshotPerformanceSample): void;
    recordSharedSnapshot(): void;
    recordSharedFragmentHit(): void;
    recordSharedFragmentBuild(sample: {
        collectMs: number;
        countMs: number;
        writeMs: number;
        bytes: number;
    }): void;
    recordSharedFragmentCopy(copyMs: number, bytes: number): void;
    recordSharedMessageFragmentHit(): void;
    recordSharedMessageFragmentBuild(sample: {
        countMs: number;
        writeMs: number;
        bytes: number;
        messages: number;
    }): void;
    recordSharedMessageFragmentCopy(copyMs: number, bytes: number): void;
    recordSnapshotSend(sendMs: number): void;
    resetSnapshotPerformance(): void;
    resetSharedUpdateFragments(): void;
    getProtocol(): ProtocolConfig;
    createProtocolEngineMessage(): {
        ntype: EngineMessage;
        nidType: import("../common/binary/Protocol").NetworkIdType;
        ntypeType: import("../common/binary/Protocol").NetworkIdType;
    };
    queueProtocolIfChanged(user: User): void;
    queueResponse(user: User, requestId: number, endpoint: ResponseEndpoint, response: any): void;
    queueErrorResponse(user: User, requestId: number, code: string, message: string): void;
    reportResponseBacklog(user: User, queued: number, sent: number): void;
    runRequestHandler(user: User, requestId: number, endpoint: ResponseEndpoint, body: any): void;
    processRequests(max?: number): number;
    onOpen(user: User): void;
    onHandshake(user: User, handshake: any, clientSchemaFingerprint?: string): Promise<void>;
    onMessage(user: User, buffer: BinaryPayload): void;
    onConnectionAccepted(user: User, payload: any): void;
    onConnectionDenied(user: User, payload: any): void;
    onClose(user: User): void;
}
//# sourceMappingURL=InstanceNetwork.d.ts.map