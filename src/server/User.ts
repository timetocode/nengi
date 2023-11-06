import { IChannel } from './IChannel'
import { Instance } from './Instance'
import { InstanceNetwork } from './InstanceNetwork'
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter'

export enum UserConnectionState {
    NULL, // initial state
    OpenPreHandshake, // socket open, handshake not complete
    OpenAwaitingHandshake, // handshake begun
    Open, // handshake accepted and network.send is safe to use
    Closed // closed, network.send would crash if invoked
}

type StringOrJSONStringifiable = string | object
type nid = number
type tick = number

export class User {
    id = 0
    socket: any
    instance: Instance | null = null
    networkAdapter: IServerNetworkAdapter
    network: InstanceNetwork | null = null
    remoteAddress: string | null = null
    connectionState = UserConnectionState.NULL
    subscriptions = new Map<number, IChannel>()
    engineMessageQueue: any[] = []
    messageQueue: any[] = []
    responseQueue: any[] = []
    tickLastSeen: Map<nid, tick> = new Map()
    //tickLastSeen: { [prop: nid]: tick } = {}
    currentlyVisible: nid[] = []
    lastSentInstanceTick = 0
    lastReceivedClientTick = 0
    latency = 0
    lastSentPingTimestamp = 0
    recentLatencies: number[] = []
    latencySamples = 3

    constructor(socket: any, networkAdapter: IServerNetworkAdapter) {
        this.socket = socket
        this.networkAdapter = networkAdapter
    }

    calculateLatency() {
        const deltaMs = Date.now() - this.lastSentPingTimestamp
        this.recentLatencies.push(deltaMs)

        if (this.recentLatencies.length > 0) {
            let curr = 0
            for (let i = 0; i < this.recentLatencies.length; i++) {
                curr += this.recentLatencies[i]
            }

            this.latency = curr / this.recentLatencies.length
        }

        while (this.recentLatencies.length > this.latencySamples) {
            this.recentLatencies.shift()
        }
    }

    subscribe(channel: IChannel) {
        this.subscriptions.set(channel.nid, channel)
    }

    unsubscribe(channel: IChannel) {
        this.subscriptions.delete(channel.nid)
    }

    queueEngineMessage(engineMessage: any) {
        this.engineMessageQueue.push(engineMessage)
    }

    queueMessage(message: any) {
        this.messageQueue.push(message)
    }

    send(buffer: Buffer | ArrayBuffer) {
        this.networkAdapter.send(this, buffer)
    }

    disconnect(reason: StringOrJSONStringifiable) {
        this.networkAdapter.disconnect(this, reason)
    }
    populateDeletions(tick: number, toDelete: number[]) {
        for (const [nid, lastSeenTick] of this.tickLastSeen.entries()) {
            if (lastSeenTick !== tick) {
                toDelete.push(nid)
                this.tickLastSeen.delete(nid)
                const index = this.currentlyVisible.indexOf(nid)
                if (index > -1) {
                    this.currentlyVisible.splice(index, 1)
                }
            }
        }
    }
    /*
    populateDeletions(tick: number, toDelete: number[]) {
        for (let i = this.currentlyVisible.length - 1; i > -1; i--) {
            const nid = this.currentlyVisible[i]
            if (this.tickLastSeen[nid] !== tick) {
                toDelete.push(nid)
                this.tickLastSeen[nid] = 0
                this.currentlyVisible.splice(i, 1)
            }
        }
    }
    */
    createOrUpdate(nid: number, tick: number, toCreate: number[], toUpdate: number[]) {
        // was this entity visible last frame?
        if (!this.tickLastSeen.has(nid)) {
            toCreate.push(nid)
            this.currentlyVisible.push(nid)
        } else {
            toUpdate.push(nid)
        }
        this.tickLastSeen.set(nid, tick)
        /*
        if (!this.tickLastSeen[nid]) {
            // no? well then this user needs to create it fully
            toCreate.push(nid)
            this.currentlyVisible.push(nid)
        } else {
            // yes? well then we just need any changes that have occurred            
            toUpdate.push(nid)
        }
        this.tickLastSeen[nid] = tick
        */

        if (this.instance!.localState.children.has(nid)) {
            for (const cid of this.instance!.localState.children.get(nid)!) {
                this.createOrUpdate(cid, tick, toCreate, toUpdate)
            }
        }
    }

    checkVisibility(tick: number) {
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []

        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visibleNids = channel.getVisibleEntities(this.id)
            for (let i = 0; i < visibleNids.length; i++) {
                this.createOrUpdate(visibleNids[i], tick, toCreate, toUpdate)
            }
        }

        this.populateDeletions(tick, toDelete)

        return { toDelete, toUpdate, toCreate }
    }

}