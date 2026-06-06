import { IChannel } from './IChannel'
import { Instance } from './Instance'
import { InstanceNetwork } from './InstanceNetwork'
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter'
import { BinaryPayload } from '../common/binary/BinaryAdapter'
import type { SnapshotResponse } from '../binary/snapshot/SnapshotPlan'
import { DEFAULT_PROTOCOL, ProtocolConfig } from '../common/binary/Protocol'

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
    responseQueue: SnapshotResponse[] = []
    protocol: ProtocolConfig = { ...DEFAULT_PROTOCOL }
    /**
     * This odd-looking tick marker setup is intentional and measured. Cleaner
     * variants that stream through collectors or build Set unions were slower in
     * stress tests because they add hot-path calls/structures without reducing
     * the real work. The current shape lets every subscribed channel hand back a
     * plain nid array, then this user does one cheap tick-mark reconciliation.
     * A nid already marked for this tick is ignored, and deletions are emitted
     * only after all subscribed channels have reported.
     */
    tickLastSeen: Map<nid, tick> = new Map()
    currentlyVisible: nid[] = []
    sharedChannelVersions: Map<number, number> = new Map()
    spatialCellChannelVersions: Map<number, number> = new Map()
    spatialCellVersionSignatures: Map<number, string> = new Map()
    spatialCellViewVersions: Map<number, number> = new Map()
    stableVisibleRefs: Map<number, number[]> = new Map()
    knownClientIdentities: Set<number> = new Set()
    lastSentInstanceTick = 0
    lastReceivedClientTick = 0
    latency = 0
    lastSentPingTimestamp = 0
    recentLatencies: number[] = []
    latencySamples = 3
    lastVisibleCount = 0

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
        this.stableVisibleRefs.delete(channel.nid)
    }

    queueEngineMessage(engineMessage: any) {
        this.engineMessageQueue.push(engineMessage)
    }

    queueMessage(message: any) {
        this.messageQueue.push(message)
    }

    send(buffer: BinaryPayload) {
        this.networkAdapter.send(this, buffer)
    }

    disconnect(reason: StringOrJSONStringifiable) {
        this.networkAdapter.disconnect(this, reason)
    }

    populateDeletions(tick: number, toDelete: number[]) {
        for (let i = this.currentlyVisible.length - 1; i >= 0; i--) {
            const nid = this.currentlyVisible[i]
            const lastSeenTick = this.tickLastSeen.get(nid)
            if (lastSeenTick !== tick) {
                toDelete.push(nid)
                this.tickLastSeen.delete(nid)
                this.currentlyVisible.splice(i, 1)
            }
        }
    }

    markVisible(
        nid: number,
        tick: number,
        toCreate: number[],
        toUpdate: number[],
        channel: IChannel | null,
        channelEntityCreates: { nid: number, channelId: number }[]
    ) {
        const lastSeenTick = this.tickLastSeen.get(nid)
        if (lastSeenTick === tick) {
            return
        }

        if (lastSeenTick === undefined) {
            toCreate.push(nid)
            if (channel && channel.clientIdentity !== undefined) {
                channelEntityCreates.push({ nid, channelId: channel.nid })
            }
            this.currentlyVisible.push(nid)
        } else {
            toUpdate.push(nid)
        }
        this.tickLastSeen.set(nid, tick)
    }

    checkVisibility(tick: number) {
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []
        const channelEntityCreates: { nid: number, channelId: number }[] = []

        if (this.subscriptions.size === 1) {
            for (const [channelId, channel] of this.subscriptions.entries()) {
                const visibleNids = channel.getVisibleNetworkedNids?.(this.id)
                if (visibleNids) {
                    if (
                        this.stableVisibleRefs.get(channelId) === visibleNids &&
                        this.currentlyVisible.length === visibleNids.length
                    ) {
                        for (let i = 0; i < visibleNids.length; i++) {
                            toUpdate.push(visibleNids[i])
                        }
                        this.lastVisibleCount = this.currentlyVisible.length
                        return { toDelete, toUpdate, toCreate, channelEntityCreates }
                    }
                    this.stableVisibleRefs.set(channelId, visibleNids)
                    for (let i = 0; i < visibleNids.length; i++) {
                        this.markVisible(visibleNids[i], tick, toCreate, toUpdate, channel, channelEntityCreates)
                    }
                    this.populateDeletions(tick, toDelete)
                    this.lastVisibleCount = this.currentlyVisible.length
                    return { toDelete, toUpdate, toCreate, channelEntityCreates }
                }
            }
        }

        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visibleNids = channel.getVisibleNetworkedNids?.(this.id)
            if (visibleNids) {
                this.stableVisibleRefs.set(channelId, visibleNids)
                for (let i = 0; i < visibleNids.length; i++) {
                    this.markVisible(visibleNids[i], tick, toCreate, toUpdate, channel, channelEntityCreates)
                }
                continue
            }

            const visibleRoots = channel.getVisibleEntities(this.id)
            for (let i = 0; i < visibleRoots.length; i++) {
                this.instance!.localState.forEachEntityTree(visibleRoots[i], nid => {
                    this.markVisible(nid, tick, toCreate, toUpdate, channel, channelEntityCreates)
                })
            }
        }

        this.populateDeletions(tick, toDelete)
        this.lastVisibleCount = this.currentlyVisible.length

        return { toDelete, toUpdate, toCreate, channelEntityCreates }
    }

}
