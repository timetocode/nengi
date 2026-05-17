import { IServerNetworkAdapter } from './IServerNetworkAdapter'
import { InstanceNetwork } from '../InstanceNetwork'
import { User, UserConnectionState } from '../User'
import { NQueue } from '../../NQueue'
import { ClientNetwork } from '../../client/ClientNetwork'
import { IClientNetworkAdapter } from '../../client/adapter/IClientNetworkAdapter'
import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter'

type MockAdapterConfig<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> = {
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
}

/**
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
class MockInstanceAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> implements IServerNetworkAdapter<InboundPayload, OutboundPayload> {
    network: InstanceNetwork
    serverSockets: MockServerSocket[]
    binary: BinaryAdapter<InboundPayload, OutboundPayload>

    constructor(network: InstanceNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>) {
        this.network = network
        this.serverSockets = []

        if (!config?.binary) {
            throw new Error('MockAdapter requires a config.binary to be created.')
        }

        this.binary = config.binary
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

    send(user: User, buffer: OutboundPayload): void {
        user.socket.send(buffer, true)
    }
}

class MockClientAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> implements IClientNetworkAdapter {
    network: ClientNetwork
    binary: BinaryAdapter<InboundPayload, OutboundPayload>

    constructor(network: ClientNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>) {
        this.network = network
        if (!config?.binary) {
            throw new Error('MockAdapter requires a config.binary to be created.')
        }
        this.binary = config.binary
    }

    onMessage(buffer: InboundPayload) {
        const br = this.binary.createReader(buffer)
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

    receive(buffer: BinaryPayload) {
        //this.inboundQueue.enqueue(buffer)
        this.network.onMessage(this.user!, buffer)
    }

    send(buffer: BinaryPayload) {
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

    send(buffer: BinaryPayload) {
        this.serverSocket.receive(buffer)
    }

    receive(buffer: BinaryPayload) {
        this.inboundQueue.enqueue(buffer)
    }
}

export { MockInstanceAdapter, MockClientAdapter, MockClientSocket, MockServerSocket }
