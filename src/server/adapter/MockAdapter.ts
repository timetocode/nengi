import { IServerNetworkAdapter } from './IServerNetworkAdapter'
import { InstanceNetwork } from '../InstanceNetwork'
import { User } from '../User'
import { ClientNetwork } from '../../client/ClientNetwork'
import { IClientNetworkAdapter } from '../../client/adapter/IClientNetworkAdapter'
import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter'
import {
    NetworkConditionLink,
    NetworkConditionLinkOptions,
    NetworkConditions
} from '../../common/network/NetworkConditionLink'

type MockAdapterConfig<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> = {
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
}

type SimulatedLocalConnectOptions = NetworkConditionLinkOptions & {
    conditions: NetworkConditions
}

/**
 * Dependency-free in-memory transport.
 * Useful for single-player modes, embedded simulations, and tests where a real
 * socket would add environment-specific noise without changing nengi behavior.
 */
class LocalInstanceAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload
> implements IServerNetworkAdapter<InboundPayload, OutboundPayload, void | { ready?: () => void }> {
    network: InstanceNetwork
    binary: BinaryAdapter<InboundPayload, OutboundPayload>

    constructor(network: InstanceNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>) {
        this.network = network

        if (!config?.binary) {
            throw new Error('LocalInstanceAdapter requires a config.binary to be created.')
        }

        this.binary = config.binary
    }

    listen(options?: void | { ready?: () => void }, ready?: () => void) {
        ready?.()
        options?.ready?.()
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

    close(socket: MockServerSocket) {
        socket.end()
    }

    disconnect(user: User, reason: any): void {
        user.socket.end(reason)
    }

    terminate(user: User, reason: any): void {
        user.socket.end(reason)
    }

    send(user: User, buffer: OutboundPayload): void {
        user.socket.send(buffer, true)
    }
}

class LocalClientAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload
> implements IClientNetworkAdapter<InboundPayload, OutboundPayload, void | MockClientSocket> {
    network: ClientNetwork
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
    socket: MockClientSocket | null = null
    connected = false
    pendingConnect: {
        resolve: (value: any) => void
        reject: (reason: any) => void
    } | null = null

    constructor(network: ClientNetwork, config: MockAdapterConfig<InboundPayload, OutboundPayload>) {
        this.network = network
        if (!config?.binary) {
            throw new Error('LocalClientAdapter requires a config.binary to be created.')
        }
        this.binary = config.binary
    }

    onMessage(buffer: InboundPayload) {
        if (!this.connected) {
            const result = this.network.readHandshakeResponse(this.binary.createReader(buffer))
            if (result.accepted) {
                this.connected = true
                this.pendingConnect?.resolve(result)
            } else {
                this.pendingConnect?.reject(result.reason)
            }
            this.pendingConnect = null
            return
        }
        const br = this.binary.createReader(buffer)
        this.network.readSnapshot(br)
    }

    connect(target?: void | MockClientSocket, handshake: any = {}) {
        this.socket = target || null
        if (!this.socket) {
            this.connected = true
            return Promise.resolve({ accepted: true })
        }

        this.socket.adapter = this
        if (this.socket.readyState !== MockSocketReadyState.OPEN) {
            this.socket.adapter = null
            this.socket = null
            return Promise.reject(new Error('Connection closed before handshake began.'))
        }
        return new Promise((resolve, reject) => {
            this.pendingConnect = { resolve, reject }
            this.socket!.send(this.network.createHandshake(handshake, this.binary))
        })
    }

    flush() {
        if (!this.socket) {
            return
        }
        if (!this.connected) {
            return
        }
        this.socket.send(this.network.createOutbound(this.binary))
    }

    flushPongs() {
        if (!this.socket || !this.connected) {
            return
        }
        try {
            this.network.flushPongs(this.binary, payload => {
                this.socket!.send(payload)
            })
        } catch (error) {
            this.network.onSocketError(error)
        }
    }

    disconnect(reason?: any) {
        if (this.socket) {
            this.socket.close(reason)
        } else if (this.connected || this.pendingConnect) {
            this.onClose(reason)
        }
    }

    onClose(reason?: any) {
        const pending = this.pendingConnect
        this.pendingConnect = null
        this.socket = null
        this.connected = false
        pending?.reject(reason ?? new Error('Disconnected before handshake completed.'))
        this.network.onDisconnect(reason)
    }
}

class SimulatedLocalInstanceAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload
> extends LocalInstanceAdapter<InboundPayload, OutboundPayload> {
    createSimulatedConnect(options: SimulatedLocalConnectOptions) {
        const socket = new SimulatedMockServerSocket(this.network, options)
        this.open(socket)
        return socket
    }
}

class SimulatedLocalClientAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload
> extends LocalClientAdapter<InboundPayload, OutboundPayload> {}


enum MockSocketReadyState {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED
}

class MockServerSocket {
    readyState: MockSocketReadyState
    clientSocket: MockClientSocket
    user: User | null
    network: InstanceNetwork

    constructor(network: InstanceNetwork) {
        this.readyState = MockSocketReadyState.CONNECTING
        this.clientSocket = new MockClientSocket(this)
        this.user = null
        this.network = network
        this.readyState = MockSocketReadyState.OPEN
    }

    end(reason?: any) {
        this.clientSocket.close(reason)
    }

    receive(buffer: BinaryPayload) {
        if (this.readyState === MockSocketReadyState.OPEN && this.user) {
            this.network.onMessage(this.user, buffer)
        }
    }

    send(buffer: BinaryPayload) {
        if (this.readyState === MockSocketReadyState.OPEN) {
            this.clientSocket.receive(buffer)
        }
    }
}

class MockClientSocket {
    readyState: MockSocketReadyState
    serverSocket: MockServerSocket
    adapter: LocalClientAdapter<any, any> | null = null

    constructor(serverSocket: MockServerSocket) {
        this.readyState = MockSocketReadyState.CONNECTING
        this.serverSocket = serverSocket
        this.readyState = MockSocketReadyState.OPEN
    }

    close(reason?: any) {
        if (this.readyState === MockSocketReadyState.CLOSED) {
            return
        }
        this.readyState = MockSocketReadyState.CLOSED
        this.serverSocket.readyState = MockSocketReadyState.CLOSED
        const adapter = this.adapter
        this.adapter = null
        if (this.serverSocket.user) {
            this.serverSocket.network.onClose(this.serverSocket.user, reason)
        }
        adapter?.onClose(reason)
    }

    send(buffer: BinaryPayload) {
        this.serverSocket.receive(buffer)
    }

    receive(buffer: BinaryPayload) {
        if (this.readyState === MockSocketReadyState.OPEN && this.adapter) {
            this.adapter.onMessage(buffer)
        }
    }
}

class SimulatedMockServerSocket extends MockServerSocket {
    declare clientSocket: SimulatedMockClientSocket
    readonly conditions: NetworkConditionLink

    constructor(network: InstanceNetwork, options: SimulatedLocalConnectOptions) {
        super(network)
        this.conditions = new NetworkConditionLink(options.conditions, options)
        this.clientSocket = new SimulatedMockClientSocket(this)
    }

    receive(buffer: BinaryPayload) {
        if (this.readyState !== MockSocketReadyState.OPEN) return
        this.conditions.sendClientToServer(buffer, payload => {
            if (this.readyState === MockSocketReadyState.OPEN && this.user) {
                this.network.onMessage(this.user, payload)
            }
        })
    }

    send(buffer: BinaryPayload) {
        if (this.readyState !== MockSocketReadyState.OPEN) return
        this.conditions.sendServerToClient(buffer, payload => {
            if (this.readyState === MockSocketReadyState.OPEN) {
                this.clientSocket.deliver(payload)
            }
        })
    }

    end(reason?: any) {
        this.conditions.clear()
        super.end(reason)
    }

    advance() {
        return this.conditions.advance()
    }

    advanceTo(nowMs: number) {
        return this.conditions.advanceTo(nowMs)
    }
}

class SimulatedMockClientSocket extends MockClientSocket {
    declare serverSocket: SimulatedMockServerSocket

    constructor(serverSocket: SimulatedMockServerSocket) {
        super(serverSocket)
    }

    receive(buffer: BinaryPayload) {
        this.serverSocket.send(buffer)
    }

    deliver(buffer: BinaryPayload) {
        if (this.readyState === MockSocketReadyState.OPEN && this.adapter) {
            this.adapter.onMessage(buffer)
        }
    }

    close(reason?: any) {
        this.serverSocket.conditions.clear()
        super.close(reason)
    }
}

const MockInstanceAdapter = LocalInstanceAdapter
const MockClientAdapter = LocalClientAdapter

export {
    LocalInstanceAdapter,
    LocalClientAdapter,
    SimulatedLocalInstanceAdapter,
    SimulatedLocalClientAdapter,
    MockInstanceAdapter,
    MockClientAdapter,
    MockClientSocket,
    MockServerSocket,
    SimulatedMockClientSocket,
    SimulatedMockServerSocket,
    SimulatedLocalConnectOptions
}
