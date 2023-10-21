/// <reference types="node" />
import { IChannel } from './IChannel';
import { Instance } from './Instance';
import { InstanceNetwork } from './InstanceNetwork';
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter';
export declare enum UserConnectionState {
    NULL = 0,
    OpenPreHandshake = 1,
    OpenAwaitingHandshake = 2,
    Open = 3,
    Closed = 4
}
type StringOrJSONStringifiable = string | object;
type nid = number;
type tick = number;
export declare class User {
    id: number;
    socket: any;
    instance: Instance | null;
    networkAdapter: IServerNetworkAdapter;
    network: InstanceNetwork | null;
    remoteAddress: string | null;
    connectionState: UserConnectionState;
    subscriptions: Map<number, IChannel>;
    engineMessageQueue: any[];
    messageQueue: any[];
    responseQueue: any[];
    tickLastSeen: {
        [prop: nid]: tick;
    };
    currentlyVisible: nid[];
    lastSentInstanceTick: number;
    lastReceivedClientTick: number;
    latency: number;
    lastSentPingTimestamp: number;
    recentLatencies: number[];
    latencySamples: number;
    constructor(socket: any, networkAdapter: IServerNetworkAdapter);
    calculateLatency(): void;
    subscribe(channel: IChannel): void;
    unsubscribe(channel: IChannel): void;
    queueEngineMessage(engineMessage: any): void;
    queueMessage(message: any): void;
    send(buffer: Buffer | ArrayBuffer): void;
    disconnect(reason: StringOrJSONStringifiable): void;
    populateDeletions(tick: number, toDelete: number[]): void;
    createOrUpdate(nid: number, tick: number, toCreate: number[], toUpdate: number[]): void;
    checkVisibility(tick: number): {
        toDelete: number[];
        toUpdate: number[];
        toCreate: number[];
    };
}
export {};
//# sourceMappingURL=User.d.ts.map