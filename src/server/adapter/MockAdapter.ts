import { Buffer } from 'buffer'
import { IServerNetworkAdapter } from './IServerNetworkAdapter'
import { InstanceNetwork } from '../InstanceNetwork'
import { User, UserConnectionState } from '../User'
import { IBinaryWriter, IBinaryWriterClass } from '../../common/binary/IBinaryWriter'
import { IBinaryReader, IBinaryReaderClass } from '../../common/binary/IBinaryReader'
import { NQueue } from '../../NQueue'
import { ClientNetwork } from '../../client/ClientNetwork'
import { IClientNetworkAdapter } from '../../client/adapter/IClientNetworkAdapter'

type MockAdapterConfig = {
    bufferCtor: typeof Buffer | typeof ArrayBuffer
    binaryWriterCtor: IBinaryWriterClass
    binaryReaderCtor: IBinaryReaderClass
}

/**
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
class MockInstanceAdapter implements IServerNetworkAdapter {
    network: InstanceNetwork
    serverSockets: MockServerSocket[]

    bufferCtor: typeof Buffer | typeof ArrayBuffer
    binaryWriterCtor: IBinaryWriterClass
    binaryReaderCtor: IBinaryReaderClass

    constructor(network: InstanceNetwork, config: MockAdapterConfig) {
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
        const socket = new MockServerSocket(this.network)
        this.open(socket)
        return socket
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

class MockClientAdapter implements IClientNetworkAdapter {
    network: ClientNetwork
    bufferCtor: typeof Buffer | typeof ArrayBuffer
    binaryWriterCtor: IBinaryWriterClass
    binaryReaderCtor: IBinaryReaderClass

    constructor(network: ClientNetwork, config: MockAdapterConfig) {
        this.network = network
        this.bufferCtor = config.bufferCtor
        this.binaryWriterCtor = config.binaryWriterCtor
        this.binaryReaderCtor = config.binaryReaderCtor
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

    onMessage(buffer: Buffer | ArrayBuffer) {
        const br = this.createBufferReader(buffer)
        this.network.readSnapshot(br)
    }

    connect(wsUrl: string, handshake: any) {
        return new Promise((resolve, reject) => {
            resolve(true)
        })
    }

    flush() {

    }
}


enum MockSocketReadyState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED
}

class MockServerSocket {
    inboundQueue: NQueue<any>
    readyState: MockSocketReadyState
    clientSocket: MockClientSocket
    user: User | null
    network: InstanceNetwork

    constructor(network: InstanceNetwork) {
        this.inboundQueue = new NQueue()
        this.readyState = MockSocketReadyState.CONNECTING
        this.clientSocket = new MockClientSocket(this)
        this.user = null
        this.network = network
        this.readyState = MockSocketReadyState.OPEN
    }

    end() {

    }

    receive(buffer: Buffer) {
        //this.inboundQueue.enqueue(buffer)
        this.network.onMessage(this.user!, buffer)
    }

    send(buffer: Buffer) {
        if (this.clientSocket) {
            this.clientSocket.receive(buffer)
        }
    }
}

class MockClientSocket {
    inboundQueue: NQueue<any>
    readyState: MockSocketReadyState
    serverSocket: MockServerSocket

    constructor(serverSocket: MockServerSocket) {
        this.inboundQueue = new NQueue()
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
        this.inboundQueue.enqueue(buffer)
    }
}

export { MockInstanceAdapter, MockClientAdapter, MockClientSocket, MockServerSocket }