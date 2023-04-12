/// <reference types="node" />
import { Buffer } from 'buffer';
import { IServerNetworkAdapter } from './IServerNetworkAdapter';
import { InstanceNetwork } from '../InstanceNetwork';
import { User } from '../User';
import { IBinaryWriter, IBinaryWriterClass } from '../../common/binary/IBinaryWriter';
import { IBinaryReader, IBinaryReaderClass } from '../../common/binary/IBinaryReader';
/**
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
declare class MockAdapter implements IServerNetworkAdapter {
    network: InstanceNetwork;
    serverSockets: MockServerSocket[];
    bufferCtor: typeof Buffer | typeof ArrayBuffer;
    binaryWriterCtor: IBinaryWriterClass;
    binaryReaderCtor: IBinaryReaderClass;
    constructor(network: InstanceNetwork, config: any);
    listen(port: number, ready: () => void): void;
    createMockConnect(): void;
    open(socket: MockServerSocket): void;
    message(socket: MockServerSocket, message: any): void;
    close(socket: MockServerSocket): void;
    disconnect(user: User, reason: any): void;
    send(user: User, buffer: Buffer): void;
    createBuffer(lengthInBytes: number): Buffer | ArrayBuffer;
    createBufferWriter(lengthInBytes: number): IBinaryWriter;
    createBufferReader(buffer: Buffer | ArrayBuffer): IBinaryReader;
}
declare enum MockSocketReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
declare class MockServerSocket {
    readyState: MockSocketReadyState;
    clientSocket: MockClientSocket;
    user: User;
    network: InstanceNetwork;
    constructor(clientSocket: MockClientSocket, user: User, network: InstanceNetwork);
    end(): void;
    receive(buffer: Buffer): void;
    send(buffer: Buffer): void;
}
declare class MockClientSocket {
    readyState: MockSocketReadyState;
    serverSocket: MockServerSocket;
    constructor(serverSocket: MockServerSocket);
    close(): void;
    send(buffer: Buffer): void;
    receive(buffer: Buffer): void;
}
export { MockAdapter };
