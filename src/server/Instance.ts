import { Channel } from './Channel'
import { Context } from '../common/Context'
import LocalState from './LocalState'
import { INetworkEvent, InstanceNetwork } from './InstanceNetwork'
import { User } from './User'
import { SpatialChannel } from './SpatialChannel'
import IChannel from './IChannel'
import EntityCache from './EntityCache'
import createSnapshotBufferRefactor from '../binary/snapshot/createSnapshotBufferRefactor'
import IEntity from '../common/IEntity'
import NQueue from '../NQueue'

class Instance {
    context: Context
    localState: LocalState
    channelId: number
    channels: Set<IChannel>
    network: InstanceNetwork
    queue: NQueue<INetworkEvent>
    users: Map<number, User>
    incrementalUserId: number
    cache: EntityCache
    tick: number
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
        this.channelId = 1
        this.channels = new Set()
        this.users = new Map()
        this.queue = new NQueue()
        this.incrementalUserId = 0
        this.cache = new EntityCache()
        this.tick = 1
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

    createChannel(): Channel {
        const channel = new Channel(this.localState, this.channelId++)
        this.channels.add(channel)
        return channel
    }

    createSpatialChannel(): SpatialChannel {
        const channel = new SpatialChannel(this.localState, this.channelId++)
        this.channels.add(channel)
        return channel
    }

    step() {
        this.tick++
        this.cache.createCachesForTick(this.tick)

        this.users.forEach(user => {
            // TODO aggregate visible entities and messages
            // demo is instead just sending message from a channel

            const buffer = createSnapshotBufferRefactor(user, this)
            user.send(buffer)
        })

        this.cache.deleteCachesForTick(this.tick)
    }
}

export { Instance }