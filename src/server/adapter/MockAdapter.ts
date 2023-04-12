import { Buffer } from 'buffer'
import { IServerNetworkAdapter } from './IServerNetworkAdapter'
import { InstanceNetwork } from '../InstanceNetwork'
import { User, UserConnectionState } from '../User'
import { IBinaryWriter, IBinaryWriterClass } from '../../common/binary/IBinaryWriter'
import { IBinaryReader, IBinaryReaderClass } from '../../common/binary/IBinaryReader'

/**
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
class MockAdapter implements IServerNetworkAdapter {
    network: InstanceNetwork
    serverSockets: MockServerSocket[]

    bufferCtor: typeof Buffer | typeof ArrayBuffer
    binaryWriterCtor: IBinaryWriterClass
    binaryReaderCtor: IBinaryReaderClass

    constructor(network: InstanceNetwork, config: any) {
        this.network = network
        this.serverSockets = []

        if (!config || !config.bufferCtor || !config.binaryWriterCtor) {
            throw new Error('MockAdapter requires a config.bufferCtor and config.binaryWriterCtor to be created.')
        }

        this.bufferCtor = config.bufferCtor
        this.binaryWriterCtor = config.binaryWriterCtor
        this.binaryReaderCtor = config.binaryReaderCtor
    }

    listen(port: number, ready: () => void) {
        console.log('MockAdapter listen is fake! No need to invoke it.')
    }

    createMockConnect() {
        /// TODO
    }

    open(socket: MockServerSocket) {
        const user = new User(socket, this)
        socket.user = user
        this.network.onOpen(user)
    }

    message(socket: MockServerSocket, message: any) {
        if (socket.user) {
           // this.network.onBinaryMessage(socket.user, message)
        }
    }

    close(socket: MockServerSocket) {
        if (socket.user) {
            this.network.onClose(socket.user)
        }
    }

    disconnect(user: User, reason: any): void {
        user.socket.end(1000, JSON.stringify(reason))
    }

    send(user: User, buffer: Buffer): void {
        user.socket.send(buffer, true)
    }

    createBuffer(lengthInBytes: number): Buffer | ArrayBuffer {
        return new this.bufferCtor(lengthInBytes)
    }

    createBufferWriter(lengthInBytes: number): IBinaryWriter {
        return new this.binaryWriterCtor(this.createBuffer(lengthInBytes))
    }

    createBufferReader(buffer: Buffer | ArrayBuffer): IBinaryReader {
        return new this.binaryReaderCtor(buffer)
    }
}

enum MockSocketReadyState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED
}

class MockServerSocket {
    readyState: MockSocketReadyState
    clientSocket: MockClientSocket
    user: User
    network: InstanceNetwork

    constructor(clientSocket: MockClientSocket, user: User, network: InstanceNetwork) {
        this.readyState = MockSocketReadyState.CONNECTING
        this.clientSocket = clientSocket
        this.user = user
        this.network = network
        this.readyState = MockSocketReadyState.OPEN
    }

    end() {

    }

    receive(buffer: Buffer) {
        //this.network.onBinaryMessage(this.user, buffer)
    }

    send(buffer: Buffer) {
        if (this.clientSocket) {

        }
    }
}

class MockClientSocket {
    readyState: MockSocketReadyState
    serverSocket: MockServerSocket

    constructor(serverSocket: MockServerSocket) {
        this.readyState = MockSocketReadyState.CONNECTING
        this.serverSocket = serverSocket
        this.readyState = MockSocketReadyState.OPEN
    }

    close() {
        this.readyState = MockSocketReadyState.CLOSED
    }

    send(buffer: Buffer) {
        this.serverSocket.receive(buffer)
    }

    receive(buffer: Buffer) {

    }
}

export { MockAdapter }