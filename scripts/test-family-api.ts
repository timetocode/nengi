// Compiled and run against packed declarations, never the engine's source types.
import * as nengi from 'nengi'
import {
    Binary, Channel, Client, CommandRouter, Context, Instance, NetworkEvent,
    UserConnectionState, defineEntitySchema, defineMessageSchema
} from 'nengi'
import type {
    BinaryPayload, ClientTransportHandlers, IClientNetworkAdapter,
    IServerNetworkAdapter, ServerAdapterHost, ServerConnection, User
} from 'nengi'
import { dataViewBinary } from 'nengi-dataviews'

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

type Socket = {
    host: ServerAdapterHost
    connection: ServerConnection<Socket | null>
    handlers?: ClientTransportHandlers<BinaryPayload>
    closed: boolean
}

class ConsumerServer implements IServerNetworkAdapter<BinaryPayload, ArrayBuffer, void> {
    readonly serverAdapterVersion = 1 as const
    readonly binary = dataViewBinary
    private closing?: Promise<void>

    constructor(readonly host: ServerAdapterHost) {
        check(host.serverAdapterVersion === 1, 'Unsupported server contract')
    }

    listen() {}

    reserve() {
        const connection = this.host.createConnection<Socket | null>(null, this, 'local')
        this.host.onOpen(connection)
        return connection
    }

    attach(connection: ServerConnection<Socket | null>): Socket {
        const socket: Socket = { host: this.host, connection, closed: connection.isClosed }
        connection.socket = socket
        if (!connection.isClosed) this.host.onOpen(connection)
        return socket
    }

    send(connection: ServerConnection<Socket | null>, payload: ArrayBuffer) {
        check(connection.socket && !connection.socket.closed, 'Transport closed')
        connection.socket.handlers?.onMessage(payload)
    }

    disconnect(connection: ServerConnection<Socket | null>, reason: unknown) {
        if (connection.socket) {
            connection.socket.closed = true
            connection.socket.handlers?.onClose(reason)
        }
        this.host.onClose(connection, reason)
    }

    shutdown(reason?: unknown) {
        if (!this.closing) {
            this.closing = Promise.resolve()
            this.host.shutdownAdapter(this, reason)
        }
        return this.closing
    }
}

class ConsumerClient implements IClientNetworkAdapter<BinaryPayload, ArrayBuffer, Socket> {
    readonly clientAdapterVersion = 2 as const
    readonly binary = dataViewBinary
    private socket?: Socket

    open(socket: Socket, handlers: ClientTransportHandlers<BinaryPayload>) {
        check(!socket.closed, 'Transport closed')
        this.socket = socket
        socket.handlers = handlers
        handlers.onOpen()
    }

    send(payload: ArrayBuffer) {
        check(this.socket && !this.socket.closed, 'Transport closed')
        this.socket.host.onMessage(this.socket.connection, payload)
    }

    close(reason: string) {
        const socket = this.socket
        this.socket = undefined
        if (socket) {
            socket.handlers = undefined
            socket.closed = true
            socket.host.onClose(socket.connection, reason)
        }
    }
}

// Never executed. These assertions catch accidental growth of the public surface.
function declarationBoundary(client: Client, instance: Instance, user: User) {
    // @ts-expect-error User is a lifecycle-provided type, not a public constructor.
    new nengi.User()
    // @ts-expect-error Network construction belongs to Client.
    new nengi.ClientNetwork()
    // @ts-expect-error Network construction belongs to Instance.
    new nengi.InstanceNetwork()
    // @ts-expect-error Wire sections are implementation details.
    nengi.BinarySection
    // @ts-expect-error Engine control messages are implementation details.
    nengi.EngineMessage
    // @ts-expect-error Transport callbacks are exposed only by adapterHost.
    instance.network.onMessage
    // @ts-expect-error Adapter hosts do not expose the game instance.
    instance.adapterHost.instance
    // @ts-expect-error Internal queues are not an application interface.
    client.network.outbound
    // @ts-expect-error Pending handshake ownership belongs to core.
    instance.network.pendingUsers
    // @ts-expect-error Removing entries directly bypasses lifecycle accounting.
    instance.users.clear()
    // @ts-expect-error The engine owns enqueueing and accounting.
    instance.queue.enqueue({})
    // @ts-expect-error Frame history is a read-only view.
    client.network.frames.pop()
    // @ts-expect-error Confirmation requires confirmCommandsThrough.
    user.lastConfirmedCommandFrameNumber = 7
    // @ts-expect-error Observed client command identity is read-only.
    client.network.commandFrameNumber = 7
    // @ts-expect-error Connection status is not set by games.
    user.connectionState = UserConnectionState.Open
    // @ts-expect-error A game cannot reassign server identity.
    user.id = 7
    // @ts-expect-error Metrics are observations, not controls.
    instance.network.snapshotPerformance.snapshots = 0
    // @ts-expect-error Socket ownership belongs to the transport.
    user.socket
}
void declarationBoundary

async function exercise(entityHistory = true) {
    for (const name of ['User', 'ClientNetwork', 'InstanceNetwork', 'BinarySection', 'EngineMessage']) {
        check(!(name in nengi), `${name} unexpectedly exported at runtime`)
    }
    const context = new Context()
    context.register(1, defineEntitySchema({ x: Binary.Float32 }))
    context.register(2, defineMessageSchema({ dx: Binary.Float32 }))
    const instance = new Instance(context)
    instance.onConnect = async () => ({ serverData: { account: 42 }, clientData: { ready: true } })
    const adapter = new ConsumerServer(instance.adapterHost)
    const other = new ConsumerServer(instance.adapterHost)
    let refused = false
    try {
        instance.adapterHost.createConnection(null, { ...adapter, serverAdapterVersion: 0 } as unknown as IServerNetworkAdapter)
    } catch (error) {
        refused = error instanceof Error && error.message.includes('contract version 1')
    }
    check(refused && instance.network.getPendingConnectionCount() === 0, 'Incompatible adapter admitted')
    const client = new Client(context, ConsumerClient, 20, undefined, { entityHistory })
    try {
        const pending = adapter.reserve()
        check(instance.network.getPendingConnectionCount() === 1, 'Admission was not reserved')
        const setup = await client.connect<{ ready: boolean }>(adapter.attach(pending))
        check(setup?.ready, 'Handshake setup data lost')
        const connected = instance.queue.next()
        check(connected.type === NetworkEvent.UserConnected, 'Missing connected event')
        check(connected.payload.account === 42, 'Server-local setup data lost')
        const user: User = connected.user
        check(user.connectionState === UserConnectionState.Open, 'User not open')
        check(user.remoteAddress === 'local', 'Transport metadata lost')
        check(instance.network.getPendingConnectionCount() === 0, 'Accepted admission retained')

        const channel = new Channel(instance.localState)
        channel.subscribe(user)
        const entity = channel.addEntity({ nid: 0, ntype: 1, x: 0 })
        instance.respond(1, () => ({ accepted: true }))
        const batch = client.network.commandFrameNumber
        check(client.addCommand({ ntype: 2, dx: 2 }) === 0, 'First command index')
        client.reportInterpolationDelay(75)
        const reply = client.request(1, {}, { timeoutMs: 0 })
        check(client.addCommandWithTiming({ ntype: 2, dx: 3 }, { viewTick: 42.5 }) === 1, 'Timed command index')
        check(client.addCommand({ ntype: 2, dx: 4 }) === 2, 'Third command index')
        client.flush()
        const stats = instance.network.getQueueStats()
        check(stats.commands === 3 && stats.requests === 1, 'Queue accounting')
        const routed: number[] = []
        const router = new CommandRouter().on<{ dx: number }>(2, ({ command, commandFrameNumber, commandIndex, timing }) => {
            check(commandFrameNumber === batch, 'Command batch identity')
            check(commandIndex !== 1 || timing?.viewTick === 42.5, 'Timed command association')
            routed.push(commandIndex)
            entity.x += command.dx
        })
        while (!instance.queue.isEmpty()) router.process(instance.queue.next())
        check(routed.join(',') === '0,1,2', 'Command order')
        user.confirmCommandsThrough(batch)
        check(instance.processRequests() === 1, 'Request not delivered')
        instance.network.snapshotPerformanceEnabled = true
        instance.step()
        const frame = client.network.processNextFrame()
        check(frame?.confirmedCommandFrameNumber === batch, 'Explicit confirmation lost')
        check(client.network.store.get(entity.nid)?.x === 9, 'Snapshot state lost')
        check(client.network.store.historyEnabled === entityHistory, 'Entity history option lost')
        check((client.network.store.history.getStats().records > 0) === entityHistory, 'Unexpected entity history recording')
        check((await reply).accepted, 'Request response lost')
        check(instance.network.snapshotPerformance.snapshots === 1, 'Metrics unavailable')
        check(client.addCommand({ ntype: 2, dx: 1 }) === 0, 'New batch index did not reset')
        check(client.network.commandFrameNumber === batch + 1, 'Batch did not advance')
        const abandoned = adapter.reserve()
        const survivor = other.reserve()
        const closing = adapter.shutdown('done')
        check(adapter.shutdown() === closing, 'Shutdown not idempotent')
        await closing
        check(abandoned.isClosed && !survivor.isClosed, 'Shutdown crossed adapter ownership')
        check(adapter.attach(abandoned).closed, 'Late upgrade revived a connection')
        check(client.connectionState === 'closed', 'Client teardown lost')
        check(instance.users.size === 0, 'Accepted user leaked')
        check(instance.network.getPendingConnectionCount() === 1, 'Pending survivor lost')
    } finally {
        client.disconnect()
        await adapter.shutdown()
        await other.shutdown()
    }
}

exercise().then(() => exercise(false)).then(() => console.log('Packed public API and structural server adapter contract passed, with and without entity history.'))
