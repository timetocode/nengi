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

export type ResponseEndpoint = {
    endpoint: EndpointDefinition | null,
    callback: ResponseHandler
}

export type InstanceOptions = {
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
    context: Context
    localState: LocalState
    network: InstanceNetwork
    queue: NQueue<INetworkEvent>
    users: Map<number, User>
    incrementalUserId: number
    cache: EntityCache
    tick: number
    pingIntervalMs: number
    pongTimeoutMs: number
    handshakeTimeoutMs: number
    readonly now: TimeSource
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
     * deny the connection. Any other resolved value accepts the connection and
     * becomes the `payload` on the queued `UserConnected` event.
     *
     * ```ts
     * instance.onConnect = async (handshake: any) => {
     *     const session = await authenticateUser(handshake)
     *     return session || false
     * }
     * ```
     */
    onConnect: (handshake: any) => Promise<any>

    constructor(context: Context, options: InstanceOptions = {}) {
        this.context = context
        this.localState = new LocalState()
        this.users = new Map()
        this.queue = new NQueue()
        this.incrementalUserId = 0
        this.cache = new EntityCache()
        this.tick = 1
        this.now = options.now ?? getMonotonicTime
        this.pingIntervalMs = positiveDuration('pingIntervalMs', options.pingIntervalMs, 2000)
        this.pongTimeoutMs = positiveDuration('pongTimeoutMs', options.pongTimeoutMs, 6000)
        this.handshakeTimeoutMs = positiveDuration('handshakeTimeoutMs', options.handshakeTimeoutMs, 5000)
        this.responseEndPoints = new Map()
        this.onInboundMessageError = () => {}
        this.onSnapshotSendError = () => {}

        this.onConnect = () => {
            console.warn('Please define an instance.onConnect handler. Return false to deny, or return a payload to accept. Connection denied.')
            return Promise.resolve(false)
        }

        this.network = new InstanceNetwork(this)
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

    step() {
        const serverTimeMs = this.now()
        if (!Number.isFinite(serverTimeMs)) {
            throw new Error('instance.now must return a finite monotonic server time.')
        }
        this.network.disconnectTimedOutUsers(serverTimeMs)

        this.tick++
        this.cache.createCachesForTick(this.tick)
        this.network.resetSharedUpdateFragments()

        try {
            Array.from(this.users.values()).forEach(user => {
                let pingId: number | null = null
                if (user.shouldSendPing(serverTimeMs, this.pingIntervalMs)) {
                    pingId = user.nextPing()
                    user.queueEngineMessage({
                        ntype: EngineMessage.Ping,
                        latency: Math.max(0, Math.min(65535, Math.round(user.roundTripMs))),
                        pingId,
                        serverTimeMs
                    })
                }

                user.queueEngineMessage({
                    ntype: EngineMessage.CommandFrameNumber,
                    commandFrameNumber: user.lastReceivedCommandFrameNumber
                })

                const buffer = createSnapshotBuffer(user, this, serverTimeMs)
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
                    if (pingId !== null) {
                        user.recordPingSent(pingId, serverTimeMs, this.now())
                    }
                    user.lastSentInstanceTick = this.tick
                }
            })
        } finally {
            this.cache.deleteCachesForTick(this.tick)
            this.localState.channels.forEach(channel => {
                channel.clearBroadcastMessages?.()
                channel.clearSnapshotDeltas?.()
            })
            this.localState.releaseDeferredIds()
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
