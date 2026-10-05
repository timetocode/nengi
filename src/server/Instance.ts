import { Context } from '../common/Context'
import { LocalState } from './LocalState'
import { INetworkEvent, InstanceNetwork } from './InstanceNetwork'
import { User, UserConnectionState } from './User'
import { EntityCache } from './EntityCache'
import createSnapshotBuffer from '../binary/snapshot/createSnapshotBuffer'
import { IEntity } from '../common/IEntity'
import { NQueue } from '../NQueue'
import { EngineMessage } from '../common/EngineMessage'
import { Endpoint, EndpointDefinition, getEndpointDefinition, getEndpointId } from '../common/Endpoint'
import { BinaryPayload } from '../common/binary/BinaryAdapter'
import { getMonotonicTime, TimeSource } from '../common/time'
import { NetworkLimitEvent, NetworkLimits, resolveNetworkLimits } from './NetworkLimits'

export type ResponseSender<Response = any> = (response: Response) => void
export type ResponseHandlerArgs<Request = any> = { user: User, body: Request }
export type ResponseHandler<Request = any, Response = any> = (
    request: ResponseHandlerArgs<Request>,
    send: ResponseSender<Response>
) => Response | void | Promise<Response | void>
export type InboundMessageError = {
    user: User
    error: unknown
    byteLength: number
    connectionState: UserConnectionState
}
export type InboundMessageErrorHandler = (event: InboundMessageError) => void
export type SnapshotSendError = {
    user: User
    error: unknown
    byteLength: number
    tick: number
}
export type SnapshotSendErrorHandler = (event: SnapshotSendError) => void

/** Local diagnostic; the error and any private details are never sent to the client. */
export type ServerRequestError = {
    user: User
    requestId: number
    endpointId: number
    phase: 'handler' | 'response'
    code: 'HANDLER_ERROR' | 'HANDLER_REJECTED' | 'RESPONSE_ENCODING_ERROR' | 'RESPONSE_TOO_LARGE'
    error: unknown
}

/** A snapshot step changed replication state and then failed. This instance is terminal. */
export class InstanceStepError extends Error {
    readonly tick: number
    readonly cause: unknown

    constructor(tick: number, cause: unknown) {
        let detail = 'See cause for the original failure.'
        try {
            detail = cause instanceof Error ? cause.message : String(cause)
        } catch {
            // Even an unprintable thrown value must leave the instance terminal.
        }
        super(`nengi Instance.step() failed at tick ${tick}. Stop this instance and recreate it before resuming replication.\n${detail}`)
        this.name = 'InstanceStepError'
        this.tick = tick
        this.cause = cause
    }
}

export type ResponseEndpoint = {
    endpoint: EndpointDefinition | null,
    callback: ResponseHandler
}

export type ConnectionAcceptance<ServerData = unknown, ClientData = unknown> = {
    /** Server-local context, passed by reference as UserConnected's event.payload. */
    serverData?: ServerData
    /** Optional JSON-serializable setup data returned by the client's connect(). */
    clientData?: ClientData
    deny?: never
}

export type ConnectionDenial<Detail = unknown> = {
    /** Deliberately public JSON detail returned in ClientConnectionError.detail. */
    deny: Detail
    serverData?: never
    clientData?: never
}

export type ConnectionAttemptContext = {
    /** Provisional identity: no accepted user id or instance until acceptance. */
    readonly user: User
    /** Aborted on failure before acceptance; not a session-disconnect signal. */
    readonly signal: AbortSignal
}

export type InstanceOptions = {
    limits?: Partial<NetworkLimits>
    now?: TimeSource
    pingIntervalMs?: number
    pongTimeoutMs?: number
    handshakeTimeoutMs?: number
}

function positiveDuration(name: string, value: number | undefined, fallback: number) {
    if (value === undefined) {
        return fallback
    }
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a finite value greater than zero.`)
    }
    return value
}

export class Instance {
    private stepFailure: InstanceStepError | null = null
    readonly context: Context
    readonly localState: LocalState
    readonly network: InstanceNetwork
    readonly queue: NQueue<INetworkEvent>
    /** @internal */
    readonly connectedUsers: Map<number, User>

    get users(): ReadonlyMap<number, User> {
        return this.connectedUsers
    }
    /** @internal */
    incrementalUserId: number
    /** @internal */
    cache: EntityCache
    tick: number
    pingIntervalMs: number
    pongTimeoutMs: number
    handshakeTimeoutMs: number
    readonly now: TimeSource
    readonly limits: Readonly<NetworkLimits>
    /** Diagnostic only; the offending connection has already been closed. */
    onNetworkLimit: (event: NetworkLimitEvent) => void = () => {}
    /** Handler/reply failures, including failures after a reply or disconnect. Observer exceptions are contained. */
    onRequestError: (event: ServerRequestError) => void = () => {}
    /** @internal */
    responseEndPoints: Map<number, ResponseEndpoint>
    /**
     * Observes malformed or otherwise unreadable inbound network messages before
     * nengi disconnects the sender. The raw payload is intentionally not exposed.
     */
    onInboundMessageError: InboundMessageErrorHandler
    /**
     * Observes adapter send failures for completed snapshot buffers before nengi
     * disconnects that user. The snapshot payload is intentionally not exposed.
     */
    onSnapshotSendError: SnapshotSendErrorHandler
    /**
     * Override this to accept or reject incoming connections. Return `false` to
     * deny the connection, `{ deny: detail }` to deny with public JSON detail,
     * `true` to accept without data, or an acceptance object.
     * Its `serverData` becomes the queued `UserConnected` event's `payload`;
     * only `clientData` is serialized and returned by the client's `connect()`.
     * The context's signal cancels abandoned setup, including encoding/send
     * failures after this handler returns. Resources remain application-owned
     * until acceptance; accepted sessions use normal disconnect cleanup.
     *
     * ```ts
     * instance.onConnect = async (handshake, { signal }) => {
     *     const session = await authenticateUser(handshake, { signal })
     *     return session ? { serverData: session } : false
     * }
     * ```
     */
    onConnect: (handshake: any, context: ConnectionAttemptContext) => Promise<boolean | ConnectionAcceptance | ConnectionDenial>

    constructor(context: Context, options: InstanceOptions = {}) {
        this.context = context
        this.localState = new LocalState()
        this.connectedUsers = new Map()
        this.queue = new NQueue(event => this.network.releaseQueuedInput(event))
        this.limits = resolveNetworkLimits(options.limits)
        this.incrementalUserId = 0
        this.cache = new EntityCache()
        this.tick = 1
        this.now = options.now ?? getMonotonicTime
        this.pingIntervalMs = positiveDuration('pingIntervalMs', options.pingIntervalMs, 2000)
        this.pongTimeoutMs = positiveDuration('pongTimeoutMs', options.pongTimeoutMs, 15000)
        this.handshakeTimeoutMs = positiveDuration('handshakeTimeoutMs', options.handshakeTimeoutMs, 5000)
        this.responseEndPoints = new Map()
        this.onInboundMessageError = () => {}
        this.onSnapshotSendError = () => {}

        this.onConnect = () => {
            console.warn('Please define an instance.onConnect handler. Return false or { deny: detail } to deny, true to accept, or { serverData, clientData } to accept with setup data. Connection denied.')
            return Promise.resolve(false)
        }

        this.network = new InstanceNetwork(this)
    }

    /** A narrow typed view of the existing network, with no per-packet proxy. */
    get adapterHost(): import('./adapter/IServerNetworkAdapter').ServerAdapterHost {
        return this.network
    }

    attachChild(parent: IEntity, child: IEntity) {
        return this.localState.addChild(parent, child)
    }

    detachChild(parent: IEntity, child: IEntity) {
        this.localState.removeChild(parent, child)
    }

    respond<Request = any, Response = any>(
        endpoint: Endpoint<Request, Response>,
        callback: ResponseHandler<Request, Response>
    ) {
        const endpointId = getEndpointId(endpoint)
        if (typeof endpoint !== 'number') {
            this.context.registerEndpoint(endpoint)
        }
        if (this.responseEndPoints.has(endpointId)) {
            throw new Error(`Response endpoint ${endpointId} is already registered.`)
        }
        this.responseEndPoints.set(endpointId, {
            endpoint: getEndpointDefinition(endpoint),
            callback: callback as ResponseHandler
        })
    }

    /**
     * Runs queued request handlers. Network reads enqueue requests instead of
     * invoking handlers immediately, allowing games to place request processing
     * at a deliberate point in the server tick.
     */
    processRequests(max?: number) {
        return this.network.processRequests(max)
    }

    /** First terminal snapshot-step error. Application code owns stopping the loop and adapters. */
    get failure() {
        return this.stepFailure
    }

    step() {
        if (this.stepFailure) throw this.stepFailure

        const serverTimeMs = this.now()
        if (!Number.isFinite(serverTimeMs)) {
            throw new Error('instance.now must return a finite monotonic server time.')
        }
        this.network.disconnectTimedOutUsers(serverTimeMs)

        try {
            this.tick++
            this.cache.createCachesForTick(this.tick)
            this.network.resetSharedUpdateFragments()

            Array.from(this.users.values()).forEach(user => {
                const ping = user.shouldSendPing(serverTimeMs, this.pingIntervalMs)
                    ? {
                        ntype: EngineMessage.Ping,
                        latency: Math.max(0, Math.min(65535, Math.round(user.roundTripMs))),
                        pingId: user.nextPing(),
                        serverTimeMs
                    } : undefined

                user.queueEngineMessage({
                    ntype: EngineMessage.CommandFrameNumber,
                    commandFrameNumber: user.lastConfirmedCommandFrameNumber
                })

                const buffer = createSnapshotBuffer(user, this, serverTimeMs, ping)
                let sent = false
                if (this.network.snapshotPerformanceEnabled) {
                    // Keep adapter send timing separate from snapshot construction:
                    // WebSocket implementations may queue synchronously while OS I/O
                    // continues outside this measured server tick.
                    const sendStart = this.now()
                    sent = this.sendSnapshotToUser(user, buffer)
                    if (sent) {
                        this.network.recordSnapshotSend(this.now() - sendStart)
                    }
                } else {
                    sent = this.sendSnapshotToUser(user, buffer)
                }
                if (sent) {
                    user.lastSentInstanceTick = this.tick
                }
            })
        } catch (error) {
            this.stepFailure = new InstanceStepError(this.tick, error)
            throw this.stepFailure
        } finally {
            try {
                this.cache.deleteCachesForTick(this.tick)
                this.localState.channels.forEach(channel => {
                    channel.clearBroadcastMessages?.()
                    channel.clearSnapshotDeltas?.()
                })
                // A diff baseline belongs to this lifetime of the id. Release it
                // before the allocator can assign that id to a different schema.
                for (const nid of this.localState.nidPool.deferredIds) {
                    delete this.cache.cache[nid]
                }
                this.localState.releaseDeferredIds()
            } catch (error) {
                // Cleanup must not hide the original serialization failure.
                this.stepFailure ??= new InstanceStepError(this.tick, error)
                // eslint-disable-next-line no-unsafe-finally -- Cleanup already threw; retain the first failure.
                throw this.stepFailure
            }
        }
    }

    private sendSnapshotToUser(user: User, buffer: BinaryPayload) {
        try {
            user.send(buffer)
            return true
        } catch (err) {
            this.notifySnapshotSendError(user, buffer, err)
            this.network.disconnectSendFailedUser(user)
            return false
        }
    }

    private notifySnapshotSendError(user: User, buffer: BinaryPayload, error: unknown) {
        try {
            this.onSnapshotSendError({
                user,
                error,
                byteLength: buffer.byteLength,
                tick: this.tick
            })
        } catch (observerError) {
            // Send error observers are diagnostic only.
        }
    }
}
