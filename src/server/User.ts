import { IChannel } from './channel/IChannel'
import { Instance } from './Instance'
import { InstanceNetwork } from './InstanceNetwork'
import { IServerNetworkAdapter } from './adapter/IServerNetworkAdapter'
import { BinaryPayload } from '../common/binary/BinaryAdapter'
import type { SnapshotResponse } from '../binary/snapshot/SnapshotPlan'
import { DEFAULT_PROTOCOL, ProtocolConfig } from '../common/binary/Protocol'
import { ChannelHeader } from '../common/ChannelHeader'

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

export type CommandTimingInput = {
    commandIndex: number
    clientTimeMs: number
    renderDelayMs: number
    viewTick: number
    viewServerTimeMs: number
}

export type CommandTimingEstimate = CommandTimingInput & {
    serverReceivedTimeMs: number
    estimatedInputTimeMs: number
    estimatedViewTimeMs: number
    estimatedInputAgeMs: number
    estimatedViewAgeMs: number
    roundTripMs: number
    oneWayMs: number
    clockOffsetMs: number
    clockSyncSamples: number
}

export type CommandViewTimeOptions = {
    nowMs: number
    fallbackRewindMs?: number
    maxRewindMs?: number
}

export function getCommandViewTimeMs(timing: CommandTimingEstimate | undefined, options: CommandViewTimeOptions) {
    const nowMs = options.nowMs
    const fallbackRewindMs = Math.max(0, options.fallbackRewindMs ?? 0)
    let viewTimeMs = nowMs - fallbackRewindMs

    if (timing) {
        if (timing.viewServerTimeMs >= 0) {
            viewTimeMs = timing.viewServerTimeMs
        } else if (Number.isFinite(timing.estimatedViewAgeMs)) {
            viewTimeMs = nowMs - Math.max(0, timing.estimatedViewAgeMs)
        }
    }

    if (options.maxRewindMs !== undefined && options.maxRewindMs > 0) {
        viewTimeMs = Math.max(nowMs - options.maxRewindMs, viewTimeMs)
    }
    return Math.min(nowMs, viewTimeMs)
}

export type UserVisibilityChannel = {
    nid: number
    header: ChannelHeader
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
    networkAdapter: IServerNetworkAdapter<any, any, any>
    network: InstanceNetwork | null = null
    remoteAddress: string | null = null
    connectionState = UserConnectionState.NULL
    subscriptions = new Map<number, IChannel>()
    engineMessageQueue: any[] = []
    messageQueue: any[] = []
    interpolatedMessageQueue: any[] = []
    scopedMessageQueue: { channelId: number, message: any }[] = []
    scopedInterpolatedMessageQueue: { channelId: number, message: any }[] = []
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
    knownChannelIds: Set<number> = new Set()
    knownChannelHeaderVersions: Map<number, number> = new Map()
    private pendingChannelOpens: Set<number> = new Set()
    private pendingChannelCloses: Set<number> = new Set()
    lastSentInstanceTick = 0
    lastReceivedClientTick = 0
    nextPingId = 1
    lastSentPingId = 0
    latency = 0
    lastSentPingTimestamp = 0
    lastSentPingTimeMs = 0
    recentLatencies: number[] = []
    latencySamples = 3
    roundTripMs = 0
    oneWayMs = 0
    minRoundTripMs = Number.POSITIVE_INFINITY
    clockOffsetMs = 0
    clockSyncSamples = 0
    interpolationDelayMs = 0
    lastInterpolationDelayTimeMs = 0
    lastVisibleCount = 0

    constructor(socket: any, networkAdapter: IServerNetworkAdapter<any, any, any>) {
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

    nextPing() {
        const pingId = this.nextPingId
        this.nextPingId++
        if (this.nextPingId > 65535) {
            this.nextPingId = 1
        }
        this.lastSentPingId = pingId
        return pingId
    }

    recordClockSyncPong(
        pong: { pingId?: number, serverTimeMs: number, clientReceiveTimeMs: number, clientSendTimeMs: number },
        serverReceiveTimeMs: number
    ) {
        if (pong.pingId !== undefined && this.lastSentPingId !== 0 && pong.pingId !== this.lastSentPingId) {
            return false
        }
        const serverSendTimeMs = pong.serverTimeMs
        const clientReceiveTimeMs = pong.clientReceiveTimeMs
        const clientSendTimeMs = pong.clientSendTimeMs
        const clientTurnaroundMs = Math.max(0, clientSendTimeMs - clientReceiveTimeMs)
        const roundTripMs = Math.max(0, (serverReceiveTimeMs - serverSendTimeMs) - clientTurnaroundMs)
        const offsetMs = ((serverSendTimeMs - clientReceiveTimeMs) + (serverReceiveTimeMs - clientSendTimeMs)) * 0.5

        this.recentLatencies.push(roundTripMs)
        while (this.recentLatencies.length > this.latencySamples) {
            this.recentLatencies.shift()
        }

        let total = 0
        for (let i = 0; i < this.recentLatencies.length; i++) {
            total += this.recentLatencies[i]
        }
        this.roundTripMs = this.recentLatencies.length > 0 ? total / this.recentLatencies.length : roundTripMs
        this.oneWayMs = this.roundTripMs * 0.5
        this.latency = this.roundTripMs
        this.minRoundTripMs = Math.min(this.minRoundTripMs, roundTripMs)
        if (this.clockSyncSamples === 0) {
            this.clockOffsetMs = offsetMs
        } else {
            this.clockOffsetMs = (this.clockOffsetMs * 0.85) + (offsetMs * 0.15)
        }
        this.clockSyncSamples++
        return true
    }

    estimateCommandTiming(input: CommandTimingInput, serverReceivedTimeMs: number): CommandTimingEstimate {
        const estimatedInputTimeMs = this.clockSyncSamples > 0
            ? input.clientTimeMs + this.clockOffsetMs
            : serverReceivedTimeMs - this.oneWayMs
        const renderDelayMs = Number.isFinite(input.renderDelayMs) ? Math.max(0, input.renderDelayMs) : 0
        const estimatedViewTimeMs = estimatedInputTimeMs - renderDelayMs
        return {
            commandIndex: input.commandIndex,
            clientTimeMs: input.clientTimeMs,
            renderDelayMs,
            viewTick: Number.isFinite(input.viewTick) ? input.viewTick : -1,
            viewServerTimeMs: Number.isFinite(input.viewServerTimeMs) ? input.viewServerTimeMs : -1,
            serverReceivedTimeMs,
            estimatedInputTimeMs,
            estimatedViewTimeMs,
            estimatedInputAgeMs: Math.max(0, serverReceivedTimeMs - estimatedInputTimeMs),
            estimatedViewAgeMs: Math.max(0, serverReceivedTimeMs - estimatedViewTimeMs),
            roundTripMs: this.roundTripMs,
            oneWayMs: this.oneWayMs,
            clockOffsetMs: this.clockOffsetMs,
            clockSyncSamples: this.clockSyncSamples
        }
    }

    recordInterpolationDelay(delayMs: number, serverReceivedTimeMs: number) {
        if (!Number.isFinite(delayMs)) {
            return false
        }
        this.interpolationDelayMs = Math.max(0, Math.min(5000, delayMs))
        this.lastInterpolationDelayTimeMs = serverReceivedTimeMs
        return true
    }

    subscribe(channel: IChannel) {
        const alreadySubscribed = this.subscriptions.has(channel.nid)
        this.subscriptions.set(channel.nid, channel)
        if (alreadySubscribed) {
            return
        }
        if (this.pendingChannelCloses.delete(channel.nid)) {
            return
        }
        if (!this.knownChannelIds.has(channel.nid)) {
            this.pendingChannelOpens.add(channel.nid)
        }
    }

    unsubscribe(channel: IChannel) {
        if (!this.subscriptions.has(channel.nid)) {
            return
        }
        this.subscriptions.delete(channel.nid)
        const pendingOpen = this.pendingChannelOpens.delete(channel.nid)
        if (!pendingOpen && this.knownChannelIds.has(channel.nid)) {
            this.pendingChannelCloses.add(channel.nid)
        }
        this.knownChannelHeaderVersions.delete(channel.nid)
        this.deleteChannelVisibilityState(channel.nid)
    }

    queueEngineMessage(engineMessage: any) {
        this.engineMessageQueue.push(engineMessage)
    }

    queueMessage(message: any) {
        this.messageQueue.push(message)
    }

    queueChannelMessage(channelId: number, message: any) {
        this.scopedMessageQueue.push({ channelId, message })
    }

    queueInterpolatedMessage(message: any) {
        this.interpolatedMessageQueue.push(message)
    }

    queueChannelInterpolatedMessage(channelId: number, message: any) {
        this.scopedInterpolatedMessageQueue.push({ channelId, message })
    }

    hasPendingChannelOpens() {
        return this.pendingChannelOpens.size > 0
    }

    consumePendingChannelOpens() {
        const opens = Array.from(this.pendingChannelOpens)
        this.pendingChannelOpens.clear()
        return opens
    }

    hasPendingChannelCloses() {
        return this.pendingChannelCloses.size > 0
    }

    consumePendingChannelCloses() {
        const deletes = Array.from(this.pendingChannelCloses)
        this.pendingChannelCloses.clear()
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
            if (channel) {
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
