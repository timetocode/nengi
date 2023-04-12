import IChannel from './IChannel';
import { Instance } from './Instance';
import { InstanceNetwork } from './InstanceNetwork';
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter';
declare enum UserConnectionState {
    NULL = 0,
    OpenPreHandshake = 1,
    OpenAwaitingHandshake = 2,
    Open = 3,
    Closed = 4
}
declare class User {
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
    cache: {
        [prop: number]: number;
    };
    cacheArr: number[];
    constructor(socket: any, networkAdapter: IServerNetworkAdapter);
    subscribe(channel: IChannel): void;
    unsubscribe(channel: IChannel): void;
    queueEngineMessage(engineMessage: any): void;
    queueMessage(message: any): void;
    createOrUpdate(id: number, tick: number, toCreate: number[], toUpdate: number[]): void;
    checkVisibility(tick: number): {
        noLongerVisible: number[];
        stillVisible: number[];
        newlyVisible: number[];
    };
}
export { User, UserConnectionState };
