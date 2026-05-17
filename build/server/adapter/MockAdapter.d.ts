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
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
declare class MockInstanceAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> implements IServerNetworkAdapter<InboundPayload, OutboundPayload> {
    network: InstanceNetwork;
    serverSockets: MockServerSocket[];
    binary: BinaryAdapter<InboundPayload, OutboundPayload>;
    constructor(network: InstanceNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>);
    listen(port: number, ready: () => void): void;
    createMockConnect(): MockServerSocket;
    open(socket: MockServerSocket): void;
    message(socket: MockServerSocket, message: any): void;
    close(socket: MockServerSocket): void;
    disconnect(user: User, reason: any): void;
    send(user: User, buffer: OutboundPayload): void;
}
declare class MockClientAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> implements IClientNetworkAdapter {
    network: ClientNetwork;
    binary: BinaryAdapter<InboundPayload, OutboundPayload>;
    constructor(network: ClientNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>);
    onMessage(buffer: InboundPayload): void;
    connect(wsUrl: string, handshake: any): Promise<unknown>;
    flush(): void;
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
    end(): void;
    receive(buffer: BinaryPayload): void;
    send(buffer: BinaryPayload): void;
}
declare class MockClientSocket {
    inboundQueue: NQueue<any>;
    readyState: MockSocketReadyState;
    serverSocket: MockServerSocket;
    constructor(serverSocket: MockServerSocket);
    close(): void;
    send(buffer: BinaryPayload): void;
    receive(buffer: BinaryPayload): void;
}
export { MockInstanceAdapter, MockClientAdapter, MockClientSocket, MockServerSocket };
//# sourceMappingURL=MockAdapter.d.ts.map