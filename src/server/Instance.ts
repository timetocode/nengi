import { Context } from '../common/Context'
import { LocalState } from './LocalState'
import { INetworkEvent, InstanceNetwork } from './InstanceNetwork'
import { User } from './User'
import { IChannel } from './IChannel'
import { EntityCache } from './EntityCache'
import createSnapshotBufferRefactor from '../binary/snapshot/createSnapshotBufferRefactor'
import { IEntity } from '../common/IEntity'
import { NQueue } from '../NQueue'
import { IdPool } from './IdPool'
import { EngineMessage } from '../common/EngineMessage'

class Instance {
    context: Context
    localState: LocalState
    channelIdPool: IdPool
    channels: Set<IChannel>
    network: InstanceNetwork
    queue: NQueue<INetworkEvent>
    users: Map<number, User>
    incrementalUserId: number
    cache: EntityCache
    tick: number
    pingIntervalMs: number
    responseEndPoints: Map<number, (body: any, send: (response: any) => void) => any>
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
        this.channelIdPool = new IdPool(65535)
        this.channels = new Set()
        this.users = new Map()
        this.queue = new NQueue()
        this.incrementalUserId = 0
        this.cache = new EntityCache()
        this.tick = 1
        this.pingIntervalMs = 10000
        this.responseEndPoints = new Map()

        this.onConnect = (handshake: any) => {
            return new Promise((resolve, reject) => {
                console.log('Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied.')
                resolve(false)
            })
        }

        this.network = new InstanceNetwork(this)
    }

    attachEntity(parentNid: number, child: IEntity) {
        this.localState.addChild(parentNid, child)
    }

    detachEntity(parentNid: number, child: IEntity) {
        this.localState.removeChild(parentNid, child)
    }

    respond(endpoint: number, callback: (body: any, send: (response: any) => void) => any) {
        this.responseEndPoints.set(endpoint, callback)
    }

    registerChannel(channel: IChannel) {
        const channelId = this.channelIdPool.nextId()
        channel.id = channelId
        this.channels.add(channel)
        return channelId
    }

    step() {
        const timestamp = Date.now()
        const timeSyncEngineMessage = {
            ntype: EngineMessage.TimeSync,
            timestamp
        }

        this.tick++
        this.cache.createCachesForTick(this.tick)

        this.users.forEach(user => {
            if (user.lastSentInstanceTick === 0) {
                // this is the first frame connected!
                user.queueEngineMessage(timeSyncEngineMessage)
            } else {
                // send timeSyncs every 20 ticks
                if (user.lastSentInstanceTick % 20 === 0) {
                    user.queueEngineMessage(timeSyncEngineMessage)
                }
            }

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
            user.send(buffer)
            user.lastSentInstanceTick = this.tick
        })

        this.cache.deleteCachesForTick(this.tick)
    }
}

export { Instance }