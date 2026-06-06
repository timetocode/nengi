import { Context } from '../common/Context'
import { LocalState } from './LocalState'
import { INetworkEvent, InstanceNetwork } from './InstanceNetwork'
import { User } from './User'
import { EntityCache } from './EntityCache'
import createSnapshotBufferRefactor from '../binary/snapshot/createSnapshotBufferRefactor'
import { IEntity } from '../common/IEntity'
import { NQueue } from '../NQueue'
import { EngineMessage } from '../common/EngineMessage'
import { Endpoint, EndpointDefinition, getEndpointDefinition, getEndpointId } from '../common/Endpoint'

type ResponseSender<Response = any> = (response: Response) => void
type ResponseHandlerArgs<Request = any> = { user: User, body: Request }
type ResponseHandler<Request = any, Response = any> = (
    request: ResponseHandlerArgs<Request>,
    send: ResponseSender<Response>
) => Response | void | Promise<Response | void>

export type ResponseEndpoint = {
    endpoint: EndpointDefinition | null,
    callback: ResponseHandler
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
    responseEndPoints: Map<number, ResponseEndpoint>
    /**
     *
     * @param handshake test test
     * ```ts
     * instance.onConnect = async (handshake: any) => {
     *      return await authenticateUser(handshake)
     * }
     * ```
     */
    onConnect: (handshake: any) => Promise<any>

    constructor(context: Context) {
        this.context = context
        this.localState = new LocalState()
        this.users = new Map()
        this.queue = new NQueue()
        this.incrementalUserId = 0
        this.cache = new EntityCache()
        this.tick = 1
        this.pingIntervalMs = 10000
        this.responseEndPoints = new Map()

        this.onConnect = (handshake: any) => {
            return new Promise((resolve, reject) => {
                console.log(`Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied. Received handshake ${handshake}`)
                resolve(false)
            })
        }

        this.network = new InstanceNetwork(this)
    }

    attachChild(parent: IEntity, child: IEntity) {
        return this.localState.addChild(parent, child)
    }

    detachChild(parent: IEntity, child: IEntity) {
        this.localState.removeChild(parent, child)
    }

    markDirty(entity: IEntity) {
        return this.localState.markDirty(entity)
    }

    respond<Request = any, Response = any>(
        endpoint: Endpoint<Request, Response>,
        callback: ResponseHandler<Request, Response>
    ) {
        this.responseEndPoints.set(getEndpointId(endpoint), {
            endpoint: getEndpointDefinition(endpoint),
            callback: callback as ResponseHandler
        })
    }

    step() {
        const timestamp = Date.now()
        const timeSyncEngineMessage = {
            ntype: EngineMessage.TimeSync,
            timestamp
        }

        this.tick++
        this.localState.tick(this.tick)
        this.cache.createCachesForTick(this.tick)
        this.network.resetSharedUpdateFragments()

        this.users.forEach(user => {
            user.queueEngineMessage(timeSyncEngineMessage)

            if (user.lastSentPingTimestamp < timestamp - this.pingIntervalMs) {
                user.queueEngineMessage({
                    ntype: EngineMessage.Ping,
                    latency: user.latency
                })
                user.lastSentPingTimestamp = timestamp
            }

            user.queueEngineMessage({
                ntype: EngineMessage.ClientTick,
                tick: user.lastReceivedClientTick
            })

            const buffer = createSnapshotBufferRefactor(user, this)
            if (this.network.snapshotPerformanceEnabled) {
                // Keep adapter send timing separate from snapshot construction:
                // WebSocket implementations may queue synchronously while OS I/O
                // continues outside this measured server tick.
                const sendStart = performance.now()
                user.send(buffer)
                this.network.recordSnapshotSend(performance.now() - sendStart)
            } else {
                user.send(buffer)
            }
            user.lastSentInstanceTick = this.tick
        })

        this.cache.deleteCachesForTick(this.tick)
        this.localState.channels.forEach(channel => {
            const clearBroadcastMessages = (channel as any).clearBroadcastMessages
            if (typeof clearBroadcastMessages === 'function') {
                clearBroadcastMessages.call(channel)
            }
            const clearSnapshotDeltas = (channel as any).clearSnapshotDeltas
            if (typeof clearSnapshotDeltas === 'function') {
                clearSnapshotDeltas.call(channel)
            }
        })
        this.localState.releaseDeferredIds()
        this.localState.clearDirty()
    }
}
