import { Channel } from './Channel'
import { Context } from '../common/Context'
import LocalState from './LocalState'
import { InstanceNetwork } from './InstanceNetwork'
import { User } from './User'
import { SpatialChannel } from './SpatialChannel'
import IChannel from './IChannel'
import EntityCache from './EntityCache'
import createSnapshotBufferRefactor from '../binary/snapshot/createSnapshotBufferRefactor'
import IEntity from '../common/IEntity'
import { IBinaryWriterClass } from '../common/binary/IBinaryWriter'

class Instance {
    context: Context
    localState: LocalState
    channelId: number
    channels: Set<IChannel>
    network: InstanceNetwork

    users: Map<number, User>

    cache: EntityCache
    tick: number

    responseEndPoints: Map<number, (body: any, send: (response: any) => void) => any>


    bufferConstructor: IBinaryWriterClass
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

    constructor(context: Context, bufferConstructor: IBinaryWriterClass) {
        this.context = context
        this.localState = new LocalState()
        this.channelId = 1
        this.channels = new Set()
        this.users = new Map()

        this.cache = new EntityCache()
        this.tick = 1

        this.responseEndPoints = new Map()

        this.bufferConstructor = bufferConstructor

        this.onConnect = (handshake: any) => {
            return new Promise((resolve, reject) => {
                console.log('Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied.')
                resolve(false)
            })
        }


        this.network = new InstanceNetwork(this)
        //this.network.listen(config.port)
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

            const buffer = createSnapshotBufferRefactor(user, this) //createSnapshotBufferBrute(user, this)//createSnapshotBuffer(user, this)


            // TODO this current takes a buffer | arraybuffer
            // there may be a way to not ts-ignore this
            // @ts-ignore
            this.network.send(user, buffer)

        })

        this.cache.deleteCachesForTick(this.tick)
    }


}

export { Instance }