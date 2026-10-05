import { IServerNetworkAdapter, ServerAdapterHost, ServerConnection } from './IServerNetworkAdapter'
import { User } from '../User'
import { ClientTransportHandlers, IClientNetworkAdapter } from '../../client/adapter/IClientNetworkAdapter'
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
    network: ServerAdapterHost
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
    readonly serverAdapterVersion = 1 as const
    private shutdownPromise?: Promise<void>

    constructor(network: ServerAdapterHost, config: MockAdapterConfig<InboundPayload, OutboundPayload>) {
        if (network?.serverAdapterVersion !== this.serverAdapterVersion) {
            throw new Error('LocalInstanceAdapter requires nengi server adapter contract version 1. Pass instance.adapterHost.')
        }
        this.network = network

        if (!config?.binary) {
            throw new Error('LocalInstanceAdapter requires a config.binary to be created.')
        }

        this.binary = config.binary
    }

    listen(options?: void | { ready?: () => void }, ready?: () => void) {
        if (this.shutdownPromise) throw new Error('LocalInstanceAdapter has shut down. Create a new adapter to listen again.')
        ready?.()
        options?.ready?.()
    }

    shutdown(reason?: any): Promise<void> {
        if (!this.shutdownPromise) {
            this.shutdownPromise = Promise.resolve()
            this.network.shutdownAdapter(this, reason)
        }
        return this.shutdownPromise
    }

    createMockConnect() {
        const socket = new MockServerSocket(this.network)
        this.open(socket)
        return socket
    }

    open(socket: MockServerSocket) {
        const user = this.network.createConnection(socket, this)
        socket.user = user as User
        this.network.onOpen(user)
    }

    close(socket: MockServerSocket) {
        socket.end()
    }

    disconnect(user: ServerConnection<MockServerSocket>, reason: any): void {
        user.socket.end(reason)
    }

    terminate(user: ServerConnection<MockServerSocket>, reason: any): void {
        user.socket.end(reason)
    }

    send(user: ServerConnection<MockServerSocket>, buffer: OutboundPayload): void {
        user.socket.send(buffer)
    }
}

class LocalClientAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload
> implements IClientNetworkAdapter<InboundPayload, OutboundPayload, MockClientSocket> {
    readonly clientAdapterVersion = 2 as const
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
    socket: MockClientSocket | null = null
    private handlers: ClientTransportHandlers<InboundPayload> | null = null

    constructor(config: MockAdapterConfig<InboundPayload, OutboundPayload>) {
        if (!config?.binary) throw new Error('LocalClientAdapter requires a config.binary to be created.')
        this.binary = config.binary
    }

    open(socket: MockClientSocket, handlers: ClientTransportHandlers<InboundPayload>) {
        if (!socket || socket.readyState !== MockSocketReadyState.OPEN) {
            throw new Error('LocalClientAdapter requires an open MockClientSocket.')
        }
        this.socket = socket
        this.handlers = handlers
        socket.adapter = this
        handlers.onOpen()
    }

    send(payload: OutboundPayload) {
        if (!this.socket || this.socket.readyState !== MockSocketReadyState.OPEN) {
            throw new Error('The local transport is not open.')
        }
        this.socket.send(payload)
    }

    close(reason: string) {
        const socket = this.socket
        this.socket = null
        this.handlers = null
        if (socket) {
            socket.adapter = null
            socket.close(reason)
        }
    }

    onMessage(payload: InboundPayload) {
        this.handlers?.onMessage(payload)
    }

    onClose(detail?: unknown) {
        const handlers = this.handlers
        this.socket = null
        this.handlers = null
        handlers?.onClose(detail)
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
    /** @internal */
    user: User | null
    network: ServerAdapterHost

    constructor(network: ServerAdapterHost) {
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

    constructor(network: ServerAdapterHost, options: SimulatedLocalConnectOptions) {
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
