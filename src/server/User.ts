import { IChannel } from './channel/IChannel'
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

export type UserVisibilityChannel = {
    nid: number
    header?: any
    getHeader?(): any
    getVisibleEntities?(userId: number): number[]
    getVisibleNetworkedNids?(userId: number): number[]
}

export type UserChannelVisibilityState = {
    tickLastSeen: Map<nid, tick>
    currentlyVisible: nid[]
    lastVisibleCount: number
}

function createChannelVisibilityState(): UserChannelVisibilityState {
    return {
        tickLastSeen: new Map(),
        currentlyVisible: [],
        lastVisibleCount: 0
    }
}

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
    private channelVisibilityStates: Map<number, UserChannelVisibilityState> = new Map()
    private legacyVisibilityState = createChannelVisibilityState()
    private pendingVisibilityDeletes: Map<number, number[]> = new Map()
    // Compatibility accessors for snapshot collectors that operate on one bound
    // channel state at a time. New code should use getChannelVisibilityState().
    tickLastSeen: Map<nid, tick> = new Map()
    currentlyVisible: nid[] = []
    sharedChannelVersions: Map<number, number> = new Map()
    stableVisibleRefs: Map<number, number[]> = new Map()
    knownChannelHeaderVersions: Map<number, number> = new Map()
    private pendingChannelHeaderDeletes: Set<number> = new Set()
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
        this.bindVisibilityState(this.legacyVisibilityState)
    }

    private bindVisibilityState(state: UserChannelVisibilityState) {
        this.tickLastSeen = state.tickLastSeen
        this.currentlyVisible = state.currentlyVisible
        this.lastVisibleCount = state.lastVisibleCount
    }

    private syncBoundVisibilityState(state: UserChannelVisibilityState) {
        state.tickLastSeen = this.tickLastSeen
        state.currentlyVisible = this.currentlyVisible
        state.lastVisibleCount = this.lastVisibleCount
    }

    // Visibility is tracked per channel, even though older collector helpers
    // still read this.currentlyVisible and this.tickLastSeen directly. Binding
    // one channel's state preserves those helpers while avoiding cross-channel
    // unioning or duplicate suppression in the production snapshot path.
    getChannelVisibilityState(channelId: number) {
        let state = this.channelVisibilityStates.get(channelId)
        if (!state) {
            state = createChannelVisibilityState()
            this.channelVisibilityStates.set(channelId, state)
        }
        return state
    }

    deleteChannelVisibilityState(channelId: number) {
        this.channelVisibilityStates.delete(channelId)
        this.stableVisibleRefs.delete(channelId)
        this.sharedChannelVersions.delete(channelId)
    }

    hasPendingVisibilityDeletes() {
        return this.pendingVisibilityDeletes.size > 0
    }

    consumePendingVisibilityDeletes() {
        const deletes: number[] = []
        for (const nids of this.pendingVisibilityDeletes.values()) {
            for (let i = 0; i < nids.length; i++) {
                deletes.push(nids[i])
            }
        }
        this.pendingVisibilityDeletes.clear()
        return deletes
    }

    withChannelVisibilityState<T>(channelId: number, fn: (state: UserChannelVisibilityState) => T): T {
        const previous = {
            tickLastSeen: this.tickLastSeen,
            currentlyVisible: this.currentlyVisible,
            lastVisibleCount: this.lastVisibleCount
        }
        const state = this.getChannelVisibilityState(channelId)
        this.bindVisibilityState(state)
        try {
            const result = fn(state)
            this.syncBoundVisibilityState(state)
            return result
        } finally {
            this.tickLastSeen = previous.tickLastSeen
            this.currentlyVisible = previous.currentlyVisible
            this.lastVisibleCount = previous.lastVisibleCount
        }
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
        const knownHeader = this.knownChannelHeaderVersions.has(channel.nid)
        if (knownHeader) {
            this.pendingChannelHeaderDeletes.add(channel.nid)
        }
        this.knownChannelHeaderVersions.delete(channel.nid)
        const state = this.channelVisibilityStates.get(channel.nid)
        if (!knownHeader && state && state.currentlyVisible.length > 0) {
            this.pendingVisibilityDeletes.set(channel.nid, state.currentlyVisible.slice())
        }
        this.deleteChannelVisibilityState(channel.nid)
    }

    queueEngineMessage(engineMessage: any) {
        this.engineMessageQueue.push(engineMessage)
    }

    queueMessage(message: any) {
        this.messageQueue.push(message)
    }

    hasPendingChannelHeaderDeletes() {
        return this.pendingChannelHeaderDeletes.size > 0
    }

    consumePendingChannelHeaderDeletes() {
        const deletes = Array.from(this.pendingChannelHeaderDeletes)
        this.pendingChannelHeaderDeletes.clear()
        return deletes
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
        channel: UserVisibilityChannel | null,
        channelEntityCreates: { nid: number, channelId: number }[]
    ) {
        const lastSeenTick = this.tickLastSeen.get(nid)
        if (lastSeenTick === tick) {
            return
        }

        if (lastSeenTick === undefined) {
            toCreate.push(nid)
            if (channel && (channel.header || channel.getHeader?.())) {
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
        toDelete.push(...this.consumePendingVisibilityDeletes())

        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visible = this.checkChannelVisibility(channel, tick)
            for (let i = 0; i < visible.toCreate.length; i++) {
                toCreate.push(visible.toCreate[i])
            }
            for (let i = 0; i < visible.toUpdate.length; i++) {
                toUpdate.push(visible.toUpdate[i])
            }
            for (let i = 0; i < visible.toDelete.length; i++) {
                toDelete.push(visible.toDelete[i])
            }
            for (let i = 0; i < visible.channelEntityCreates.length; i++) {
                channelEntityCreates.push(visible.channelEntityCreates[i])
            }
        }

        return { toDelete, toUpdate, toCreate, channelEntityCreates }
    }

    checkChannelVisibility(channel: UserVisibilityChannel, tick: number) {
        return this.withChannelVisibilityState(channel.nid, () => {
            const toCreate: number[] = []
            const toUpdate: number[] = []
            const toDelete: number[] = []
            const channelEntityCreates: { nid: number, channelId: number }[] = []

            const visibleNids = channel.getVisibleNetworkedNids?.(this.id)
            if (visibleNids) {
                if (
                    this.stableVisibleRefs.get(channel.nid) === visibleNids &&
                    this.currentlyVisible.length === visibleNids.length
                ) {
                    for (let i = 0; i < visibleNids.length; i++) {
                        toUpdate.push(visibleNids[i])
                    }
                    this.lastVisibleCount = this.currentlyVisible.length
                    return { toDelete, toUpdate, toCreate, channelEntityCreates }
                }
                this.stableVisibleRefs.set(channel.nid, visibleNids)
                for (let i = 0; i < visibleNids.length; i++) {
                    this.markVisible(visibleNids[i], tick, toCreate, toUpdate, channel, channelEntityCreates)
                }
                this.populateDeletions(tick, toDelete)
                this.lastVisibleCount = this.currentlyVisible.length
                return { toDelete, toUpdate, toCreate, channelEntityCreates }
            }

            const visibleRoots = channel.getVisibleEntities?.(this.id) || []
            for (let i = 0; i < visibleRoots.length; i++) {
                this.instance!.localState.forEachEntityTree(visibleRoots[i], nid => {
                    this.markVisible(nid, tick, toCreate, toUpdate, channel, channelEntityCreates)
                })
            }

            this.populateDeletions(tick, toDelete)
            this.lastVisibleCount = this.currentlyVisible.length

            return { toDelete, toUpdate, toCreate, channelEntityCreates }
        })
    }

}
