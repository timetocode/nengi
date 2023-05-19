import { Channel } from './Channel'
import { IChannel } from './IChannel'
import { Instance } from './Instance'
import { InstanceNetwork } from './InstanceNetwork'
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter'

enum UserConnectionState {
    NULL, // initial state
    OpenPreHandshake, // socket open, handshake not complete
    OpenAwaitingHandshake, // handshake begun
    Open, // handshake accepted and network.send is safe to use
    Closed // closed, network.send would crash if invoked
}

type StringOrJSONStringifiable = string | Object


class User {
    id: number

    // used by specific websocket implementations, we could have used a union
    // here, but that would be a mistake because it would involve including
    // *all* of the websocket dependencies
    socket: any

    instance: Instance | null
    networkAdapter: IServerNetworkAdapter
    network: InstanceNetwork | null

    remoteAddress: string | null
    connectionState: UserConnectionState

    subscriptions: Map<number, IChannel>

    engineMessageQueue: any[]
    messageQueue: any[]
    responseQueue: any[]

    cache: { [prop: number]: number }
    cacheArr: number[]

    lastSentInstanceTick: number
    lastReceivedClientTick: number

    constructor(socket: any, networkAdapter: IServerNetworkAdapter) {
        this.id = 0
        this.socket = socket
        this.instance = null
        this.networkAdapter = networkAdapter
        this.network = null
        this.remoteAddress = null
        this.connectionState = UserConnectionState.NULL
        this.subscriptions = new Map()
        this.engineMessageQueue = []
        this.messageQueue = []
        this.responseQueue = []

        this.cache = {}
        this.cacheArr = []

        this.lastSentInstanceTick = 0
        this.lastReceivedClientTick = 0
    }

    subscribe(channel: IChannel) {
        this.subscriptions.set(channel.id, channel)
    }

    unsubscribe(channel: IChannel) {
        this.subscriptions.delete(channel.id)
    }

    queueEngineMessage(engineMessage: any) {
        this.engineMessageQueue.push(engineMessage)
    }

    queueMessage(message: any) {
        this.messageQueue.push(message)
    }

    createOrUpdate(id: number, tick: number, toCreate: number[], toUpdate: number[]) {
        if (!this.cache[id]) {
            //console.log('create push', id)
            toCreate.push(id)
            this.cache[id] = tick
            this.cacheArr.push(id)
        } else {
            this.cache[id] = tick
            toUpdate.push(id)
        }

        const children = this.instance!.localState.parents.get(id)
        if (children) {
            children.forEach((id: number) => this.createOrUpdate(id, tick, toCreate, toUpdate))
        }
    }

    send(buffer: Buffer | ArrayBuffer) {
        this.networkAdapter.send(this, buffer)
    }

    disconnect(reason: StringOrJSONStringifiable) {
        this.networkAdapter.disconnect(this, reason)
    }

    checkVisibility(tick: number) {
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []

        this.subscriptions.forEach(channel => {
            channel.getVisibileEntities(this.id).forEach(nid => {
                this.createOrUpdate(nid, tick, toCreate, toUpdate)
            })
        })

        for (let i = this.cacheArr.length - 1; i > -1; i--) {
            const id = this.cacheArr[i]
            if (this.cache[id] !== tick) {
                //console.log('delete', id)
                toDelete.push(id)
                this.cache[id] = 0
                //delete this.cache[id]
                this.cacheArr.splice(i, 1)
            }
        }

        return {
            //events: nearby.events,
            noLongerVisible: toDelete, //diffs.aOnly,
            stillVisible: toUpdate,//diffs.both,
            newlyVisible: toCreate//diffs.bOnly
        }
    }

}

export { User, UserConnectionState }