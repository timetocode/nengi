import { IServerNetworkAdapter } from './IServerNetworkAdapter';
import { InstanceNetwork } from '../InstanceNetwork';
import { User } from '../User';
import { NQueue } from '../../NQueue';
import { ClientNetwork } from '../../client/ClientNetwork';
import { IClientNetworkAdapter } from '../../client/adapter/IClientNetworkAdapter';
import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter';
type MockAdapterConfig<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> = {
    binary: BinaryAdapter<InboundPayload, OutboundPayload>;
};
/**
 * Dependency-free in-memory transport.
 * Useful for single-player modes, embedded simulations, and tests where a real
 * socket would add environment-specific noise without changing nengi behavior.
 */
declare class LocalInstanceAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> implements IServerNetworkAdapter<InboundPayload, OutboundPayload, void | {
    ready?: () => void;
}> {
    network: InstanceNetwork;
    serverSockets: MockServerSocket[];
    binary: BinaryAdapter<InboundPayload, OutboundPayload>;
    constructor(network: InstanceNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>);
    listen(options?: void | {
        ready?: () => void;
    }, ready?: () => void): void;
    createMockConnect(): MockServerSocket;
    open(socket: MockServerSocket): void;
    message(socket: MockServerSocket, message: any): void;
    close(socket: MockServerSocket): void;
    disconnect(user: User, reason: any): void;
    send(user: User, buffer: OutboundPayload): void;
}
declare class LocalClientAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> implements IClientNetworkAdapter<InboundPayload, OutboundPayload, void | MockClientSocket> {
    network: ClientNetwork;
    binary: BinaryAdapter<InboundPayload, OutboundPayload>;
    socket: MockClientSocket | null;
    connected: boolean;
    pendingConnect: {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
    } | null;
    constructor(network: ClientNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>);
    onMessage(buffer: InboundPayload): void;
    connect(target?: void | MockClientSocket, handshake?: any): Promise<unknown>;
    flush(): void;
    disconnect(reason?: any): void;
}
declare enum MockSocketReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
declare class MockServerSocket {
    inboundQueue: NQueue<any>;
    readyState: MockSocketReadyState;
    clientSocket: MockClientSocket;
    user: User | null;
    network: InstanceNetwork;
    constructor(network: InstanceNetwork);
    end(reason?: any): void;
    receive(buffer: BinaryPayload): void;
    send(buffer: BinaryPayload): void;
}
declare class MockClientSocket {
    inboundQueue: NQueue<any>;
    readyState: MockSocketReadyState;
    serverSocket: MockServerSocket;
    adapter: LocalClientAdapter<any, any> | null;
    constructor(serverSocket: MockServerSocket);
    close(reason?: any): void;
    send(buffer: BinaryPayload): void;
    receive(buffer: BinaryPayload): void;
}
declare const MockInstanceAdapter: typeof LocalInstanceAdapter;
declare const MockClientAdapter: typeof LocalClientAdapter;
export { LocalInstanceAdapter, LocalClientAdapter, MockInstanceAdapter, MockClientAdapter, MockClientSocket, MockServerSocket };
//# sourceMappingURL=MockAdapter.d.ts.map