import { IChannel } from './channel/IChannel';
import { Instance } from './Instance';
import { InstanceNetwork } from './InstanceNetwork';
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter';
import { BinaryPayload } from '../common/binary/BinaryAdapter';
import type { SnapshotResponse } from '../binary/snapshot/SnapshotPlan';
import { ProtocolConfig } from '../common/binary/Protocol';
import { ChannelHeader } from '../common/ChannelHeader';
export declare enum UserConnectionState {
    NULL = 0,// initial state
    OpenPreHandshake = 1,// socket open, handshake not complete
    OpenAwaitingHandshake = 2,// handshake begun
    Open = 3,// handshake accepted and network.send is safe to use
    Closed = 4
}
type StringOrJSONStringifiable = string | object;
type nid = number;
type tick = number;
export type CommandTimingInput = {
    commandIndex: number;
    clientTimeMs: number;
    renderDelayMs: number;
    viewTick: number;
    viewServerTimeMs: number;
};
export type CommandTimingEstimate = CommandTimingInput & {
    serverReceivedTimeMs: number;
    estimatedInputTimeMs: number;
    estimatedViewTimeMs: number;
    estimatedInputAgeMs: number;
    estimatedViewAgeMs: number;
    roundTripMs: number;
    oneWayMs: number;
    clockOffsetMs: number;
    clockSyncSamples: number;
};
export type CommandViewTimeOptions = {
    nowMs: number;
    fallbackRewindMs?: number;
    maxRewindMs?: number;
};
export declare function getCommandViewTimeMs(timing: CommandTimingEstimate | undefined, options: CommandViewTimeOptions): number;
export type UserVisibilityChannel = {
    nid: number;
    header: ChannelHeader;
    getVisibleEntities?(userId: number): number[];
    getVisibleNetworkedNids?(userId: number): number[];
};
export type UserChannelVisibilityState = {
    tickLastSeen: Map<nid, tick>;
    currentlyVisible: nid[];
    lastVisibleCount: number;
};
export declare class User {
    id: number;
    socket: any;
    instance: Instance | null;
    networkAdapter: IServerNetworkAdapter<any, any, any>;
    network: InstanceNetwork | null;
    remoteAddress: string | null;
    connectionState: UserConnectionState;
    subscriptions: Map<number, IChannel>;
    engineMessageQueue: any[];
    messageQueue: any[];
    interpolatedMessageQueue: any[];
    scopedMessageQueue: {
        channelId: number;
        message: any;
    }[];
    scopedInterpolatedMessageQueue: {
        channelId: number;
        message: any;
    }[];
    responseQueue: SnapshotResponse[];
    protocol: ProtocolConfig;
    private channelVisibilityStates;
    private legacyVisibilityState;
    private pendingVisibilityDeletes;
    tickLastSeen: Map<nid, tick>;
    currentlyVisible: nid[];
    sharedChannelVersions: Map<number, number>;
    stableVisibleRefs: Map<number, number[]>;
    knownChannelIds: Set<number>;
    knownChannelHeaderVersions: Map<number, number>;
    private pendingChannelOpens;
    private pendingChannelCloses;
    lastSentInstanceTick: number;
    lastReceivedClientTick: number;
    nextPingId: number;
    lastSentPingId: number;
    latency: number;
    lastSentPingTimestamp: number;
    lastSentPingTimeMs: number;
    recentLatencies: number[];
    latencySamples: number;
    roundTripMs: number;
    oneWayMs: number;
    minRoundTripMs: number;
    clockOffsetMs: number;
    clockSyncSamples: number;
    interpolationDelayMs: number;
    lastInterpolationDelayTimeMs: number;
    lastVisibleCount: number;
    constructor(socket: any, networkAdapter: IServerNetworkAdapter<any, any, any>);
    private bindVisibilityState;
    private syncBoundVisibilityState;
    getChannelVisibilityState(channelId: number): UserChannelVisibilityState;
    deleteChannelVisibilityState(channelId: number): void;
    hasPendingVisibilityDeletes(): boolean;
    consumePendingVisibilityDeletes(): number[];
    withChannelVisibilityState<T>(channelId: number, fn: (state: UserChannelVisibilityState) => T): T;
    calculateLatency(): void;
    nextPing(): number;
    recordClockSyncPong(pong: {
        pingId?: number;
        serverTimeMs: number;
        clientReceiveTimeMs: number;
        clientSendTimeMs: number;
    }, serverReceiveTimeMs: number): boolean;
    estimateCommandTiming(input: CommandTimingInput, serverReceivedTimeMs: number): CommandTimingEstimate;
    recordInterpolationDelay(delayMs: number, serverReceivedTimeMs: number): boolean;
    subscribe(channel: IChannel): void;
    unsubscribe(channel: IChannel): void;
    queueEngineMessage(engineMessage: any): void;
    queueMessage(message: any): void;
    queueChannelMessage(channelId: number, message: any): void;
    queueInterpolatedMessage(message: any): void;
    queueChannelInterpolatedMessage(channelId: number, message: any): void;
    hasPendingChannelOpens(): boolean;
    consumePendingChannelOpens(): number[];
    hasPendingChannelCloses(): boolean;
    consumePendingChannelCloses(): number[];
    send(buffer: BinaryPayload): void;
    disconnect(reason: StringOrJSONStringifiable): void;
    populateDeletions(tick: number, toDelete: number[]): void;
    markVisible(nid: number, tick: number, toCreate: number[], toUpdate: number[], channel: UserVisibilityChannel | null, channelEntityCreates: {
        nid: number;
        channelId: number;
    }[]): void;
    checkVisibility(tick: number): {
        toDelete: number[];
        toUpdate: number[];
        toCreate: number[];
        channelEntityCreates: {
            nid: number;
            channelId: number;
        }[];
    };
    checkChannelVisibility(channel: UserVisibilityChannel, tick: number): {
        toDelete: number[];
        toUpdate: number[];
        toCreate: number[];
        channelEntityCreates: {
            nid: number;
            channelId: number;
        }[];
    };
}
export {};
//# sourceMappingURL=User.d.ts.map