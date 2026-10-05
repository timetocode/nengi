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
    if (!Number.isFinite(nowMs)) throw new Error('nowMs must be finite.')
    const fallbackRewindMs = Number.isFinite(options.fallbackRewindMs) ? Math.max(0, options.fallbackRewindMs!) : 0
    let viewTimeMs = nowMs - fallbackRewindMs

    if (timing) {
        if (Number.isFinite(timing.viewServerTimeMs) && timing.viewServerTimeMs >= 0) {
            viewTimeMs = timing.viewServerTimeMs
        } else if (Number.isFinite(timing.estimatedViewTimeMs)) {
            // The estimate is anchored at receipt. Queueing must not move the
            // world the client saw forward to the command's processing time.
            viewTimeMs = timing.estimatedViewTimeMs
        }
    }

    if (Number.isFinite(options.maxRewindMs) && options.maxRewindMs! > 0) {
        viewTimeMs = Math.max(nowMs - options.maxRewindMs!, viewTimeMs)
    }
    return Math.min(nowMs, viewTimeMs)
}

export class User {
    private observedId = 0
    /** @internal */
    socket: any
    /** @internal */
    instance: Instance | null = null
    /** @internal */
    networkAdapter: IServerNetworkAdapter<any, any, any>
    /** @internal */
    network: InstanceNetwork | null = null
    private observedRemoteAddress: string | null = null
    private observedOpenedAtMs: number | null = null
    private observedConnectionState = UserConnectionState.NULL
    /** @internal */
    subscriptions = new Map<number, IChannel>()
    /** @internal */
    engineMessageQueue: any[] = []
    /** @internal */
    messageQueue: any[] = []
    /** @internal */
    interpolatedMessageQueue: any[] = []
    /** @internal */
    scopedMessageQueue: { channelId: number, message: any }[] = []
    /** @internal */
    scopedInterpolatedMessageQueue: { channelId: number, message: any }[] = []
    /** @internal */
    responseQueue: SnapshotResponse[] = []
    /** Engine accounting; consume server queues through next/dequeue/removeWhere/clear. */
    /** @internal */
    queuedCommandCount = 0
    /** @internal */
    queuedRequestCount = 0
    /** @internal */
    queuedInputBytes = 0
    /** @internal */
    queuedResponseBytes = 0
    /** @internal */
    inboundRateTimeMs: number | null = null
    /** @internal */
    inboundPacketTokens = 0
    /** @internal */
    inboundByteTokens = 0
    /** @internal */
    protocol: ProtocolConfig = { ...DEFAULT_PROTOCOL }
    /** @internal */
    knownChannelIds: Set<number> = new Set()
    /** @internal */
    knownChannelHeaderVersions: Map<number, number> = new Map()
    private pendingChannelOpens: Set<number> = new Set()
    private pendingChannelCloses: Set<number> = new Set()
    /** @internal */
    lastSentInstanceTick = 0
    private observedLastReceivedCommandFrameNumber = 0
    private confirmedCommandFrameNumber = 0
    /** @internal */
    nextPingId = 1
    /** @internal */
    lastSentPingId = 0
    private observedLatency = 0
    /** @internal */
    lastPingSentAtMs: number | null = null
    /** @internal */
    firstUnansweredPingSentAtMs: number | null = null
    /** @internal */
    lastPongReceivedAtMs: number | null = null
    /** @internal */
    pendingPings = new Map<number, { serverTimeMs: number, sentAtMs: number }>()
    /** @internal */
    recentLatencies: number[] = []
    /** @internal */
    latencySamples = 3
    private observedRoundTripMs = 0
    private observedOneWayMs = 0
    /** @internal */
    minRoundTripMs = Number.POSITIVE_INFINITY
    private observedClockOffsetMs = 0
    private observedClockSyncSamples = 0
    private observedInterpolationDelayMs = 0
    /** @internal */
    lastInterpolationDelayTimeMs = 0

    /** @internal */
    constructor(socket: any, networkAdapter: IServerNetworkAdapter<any, any, any>) {
        this.socket = socket
        this.networkAdapter = networkAdapter
    }

    get id(): number {
        return this.observedId
    }

    /** @internal */
    set id(value: number) {
        this.observedId = value
    }

    get remoteAddress(): string | null {
        return this.observedRemoteAddress
    }

    /** @internal */
    set remoteAddress(value: string | null) {
        this.observedRemoteAddress = value
    }

    get openedAtMs(): number | null {
        return this.observedOpenedAtMs
    }

    /** @internal */
    set openedAtMs(value: number | null) {
        this.observedOpenedAtMs = value
    }

    get connectionState(): UserConnectionState {
        return this.observedConnectionState
    }

    /** @internal */
    set connectionState(value: UserConnectionState) {
        this.observedConnectionState = value
    }

    get lastReceivedCommandFrameNumber(): number {
        return this.observedLastReceivedCommandFrameNumber
    }

    /** @internal */
    set lastReceivedCommandFrameNumber(value: number) {
        this.observedLastReceivedCommandFrameNumber = value
    }

    get latency(): number {
        return this.observedLatency
    }

    /** @internal */
    set latency(value: number) {
        this.observedLatency = value
    }

    get roundTripMs(): number {
        return this.observedRoundTripMs
    }

    /** @internal */
    set roundTripMs(value: number) {
        this.observedRoundTripMs = value
    }

    get oneWayMs(): number {
        return this.observedOneWayMs
    }

    /** @internal */
    set oneWayMs(value: number) {
        this.observedOneWayMs = value
    }

    get clockOffsetMs(): number {
        return this.observedClockOffsetMs
    }

    /** @internal */
    set clockOffsetMs(value: number) {
        this.observedClockOffsetMs = value
    }

    get clockSyncSamples(): number {
        return this.observedClockSyncSamples
    }

    /** @internal */
    set clockSyncSamples(value: number) {
        this.observedClockSyncSamples = value
    }

    get interpolationDelayMs(): number {
        return this.observedInterpolationDelayMs
    }

    /** @internal */
    set interpolationDelayMs(value: number) {
        this.observedInterpolationDelayMs = value
    }

    /** @internal Transport observation exposed through ServerConnection. */
    get isClosed() {
        return this.connectionState === UserConnectionState.Closed
    }

    /** @internal */
    nextPing() {
        const pingId = this.nextPingId
        this.nextPingId++
        if (this.nextPingId > 65535) {
            this.nextPingId = 1
        }
        this.lastSentPingId = pingId
        return pingId
    }

    /** @internal */
    shouldSendPing(nowMs: number, intervalMs: number) {
        return this.lastPingSentAtMs === null || nowMs - this.lastPingSentAtMs >= intervalMs
    }

    /** @internal */
    recordPingSent(pingId: number, serverTimeMs: number, sentAtMs: number) {
        this.pendingPings.set(pingId, { serverTimeMs, sentAtMs })
        this.lastPingSentAtMs = sentAtMs
        if (this.firstUnansweredPingSentAtMs === null) {
            this.firstUnansweredPingSentAtMs = sentAtMs
        }

        // Keep enough recent samples to accept delayed Pongs without allowing
        // an unbounded connection lifetime queue.
        while (this.pendingPings.size > 16) {
            const oldestPingId = this.pendingPings.keys().next().value
            if (oldestPingId === undefined) {
                break
            }
            this.pendingPings.delete(oldestPingId)
        }
    }

    /** @internal */
    hasPongTimedOut(nowMs: number, timeoutMs: number) {
        const lastActivityAtMs = this.lastPongReceivedAtMs ?? this.firstUnansweredPingSentAtMs
        if (lastActivityAtMs === null) {
            return false
        }
        return nowMs - lastActivityAtMs >= timeoutMs
    }

    /** @internal */
    receiveCommandFrameNumber(commandFrameNumber: number) {
        if (!Number.isSafeInteger(commandFrameNumber) || commandFrameNumber <= 0 || commandFrameNumber > 0xffffffff) {
            return this.lastReceivedCommandFrameNumber
        }

        if (commandFrameNumber > this.lastReceivedCommandFrameNumber) {
            this.lastReceivedCommandFrameNumber = commandFrameNumber
        }
        return this.lastReceivedCommandFrameNumber
    }

    /** The complete input prefix explicitly confirmed by game code. */
    get lastConfirmedCommandFrameNumber() {
        return this.confirmedCommandFrameNumber
    }

    /**
     * Confirm that authoritative state reflects the handling of every received
     * command batch through this number, including deliberately rejected input.
     * Call after the relevant simulation work and before instance.step(). Merely
     * receiving or routing a batch does not confirm it. An older completion is
     * harmless, but must not be used to skip unfinished earlier input.
     *
     * Games without command/state prediction need no confirmation call unless
     * they use this completion boundary themselves. Requests resolve by response.
     */
    confirmCommandsThrough(commandFrameNumber: number) {
        if (!Number.isSafeInteger(commandFrameNumber) || commandFrameNumber < 0 ||
            commandFrameNumber > 0xffffffff || commandFrameNumber > this.lastReceivedCommandFrameNumber) {
            throw new RangeError('Command confirmation must be a received UInt32 command frame number.')
        }
        this.confirmedCommandFrameNumber = Math.max(this.confirmedCommandFrameNumber, commandFrameNumber)
        return this.confirmedCommandFrameNumber
    }

    /** @internal */
    recordClockSyncPong(
        pong: { pingId: number, clientReceiveTimeMs: number, clientSendTimeMs: number },
        serverReceiveTimeMs: number
    ) {
        const pendingPing = this.pendingPings.get(pong.pingId)
        if (!pendingPing) {
            return false
        }
        if (
            !Number.isFinite(serverReceiveTimeMs) ||
            !Number.isFinite(pong.clientReceiveTimeMs) ||
            !Number.isFinite(pong.clientSendTimeMs) ||
            Math.abs(pong.clientReceiveTimeMs) > Number.MAX_SAFE_INTEGER ||
            Math.abs(pong.clientSendTimeMs) > Number.MAX_SAFE_INTEGER ||
            pong.clientSendTimeMs < pong.clientReceiveTimeMs
        ) {
            return false
        }

        const serverSendTimeMs = pendingPing.serverTimeMs
        const clientReceiveTimeMs = pong.clientReceiveTimeMs
        const clientSendTimeMs = pong.clientSendTimeMs
        const clientTurnaroundMs = Math.max(0, clientSendTimeMs - clientReceiveTimeMs)
        const elapsedMs = serverReceiveTimeMs - pendingPing.sentAtMs
        // Client processing cannot exceed the observed trip. Allow 1 ms for
        // clock rounding; an implausible sample must not renew liveness.
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || clientTurnaroundMs > elapsedMs + 1) return false
        const roundTripMs = Math.max(0, elapsedMs - clientTurnaroundMs)
        const offsetMs = ((serverSendTimeMs - clientReceiveTimeMs) + (serverReceiveTimeMs - clientSendTimeMs)) * 0.5

        const clockOffsetMs = this.clockSyncSamples === 0
            ? offsetMs : (this.clockOffsetMs * 0.85) + (offsetMs * 0.15)
        if (!Number.isFinite(roundTripMs) || !Number.isFinite(clockOffsetMs)) return false

        this.pendingPings.delete(pong.pingId)
        this.lastPongReceivedAtMs = serverReceiveTimeMs
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
        this.clockOffsetMs = clockOffsetMs
        this.clockSyncSamples++
        return true
    }

    estimateCommandTiming(input: CommandTimingInput, serverReceivedTimeMs: number): CommandTimingEstimate {
        // Fractional clocks are valid; values outside safe millisecond magnitude
        // cannot represent useful client timing. Check before deriving estimates.
        if (!Number.isFinite(input.clientTimeMs) || Math.abs(input.clientTimeMs) > Number.MAX_SAFE_INTEGER ||
            !Number.isFinite(input.renderDelayMs) || input.renderDelayMs > Number.MAX_SAFE_INTEGER || input.renderDelayMs < 0 ||
            !Number.isFinite(input.viewTick) || Math.abs(input.viewTick) > Number.MAX_SAFE_INTEGER ||
            !Number.isFinite(input.viewServerTimeMs) || Math.abs(input.viewServerTimeMs) > Number.MAX_SAFE_INTEGER ||
            !Number.isFinite(serverReceivedTimeMs)) {
            throw new Error('Invalid command timing.')
        }
        const estimatedInputTimeMs = this.clockSyncSamples > 0
            ? input.clientTimeMs + this.clockOffsetMs
            : serverReceivedTimeMs - this.oneWayMs
        const renderDelayMs = Number.isFinite(input.renderDelayMs) ? Math.max(0, input.renderDelayMs) : 0
        const estimatedViewTimeMs = estimatedInputTimeMs - renderDelayMs
        const estimatedInputAgeMs = Math.max(0, serverReceivedTimeMs - estimatedInputTimeMs)
        const estimatedViewAgeMs = Math.max(0, serverReceivedTimeMs - estimatedViewTimeMs)
        if (!Number.isFinite(estimatedInputTimeMs) || !Number.isFinite(estimatedViewTimeMs) ||
            !Number.isFinite(estimatedInputAgeMs) || !Number.isFinite(estimatedViewAgeMs)) {
            throw new Error('Invalid derived command timing.')
        }
        return {
            commandIndex: input.commandIndex,
            clientTimeMs: input.clientTimeMs,
            renderDelayMs,
            viewTick: Number.isFinite(input.viewTick) ? input.viewTick : -1,
            viewServerTimeMs: Number.isFinite(input.viewServerTimeMs) ? input.viewServerTimeMs : -1,
            serverReceivedTimeMs,
            estimatedInputTimeMs,
            estimatedViewTimeMs,
            estimatedInputAgeMs,
            estimatedViewAgeMs,
            roundTripMs: this.roundTripMs,
            oneWayMs: this.oneWayMs,
            clockOffsetMs: this.clockOffsetMs,
            clockSyncSamples: this.clockSyncSamples
        }
    }

    /** @internal */
    recordInterpolationDelay(delayMs: number, serverReceivedTimeMs: number) {
        if (!Number.isFinite(delayMs)) {
            return false
        }
        this.interpolationDelayMs = Math.max(0, Math.min(5000, delayMs))
        this.lastInterpolationDelayTimeMs = serverReceivedTimeMs
        return true
    }

    /** @internal */
    subscribe(channel: IChannel) {
        const alreadySubscribed = this.subscriptions.has(channel.nid)
        this.subscriptions.set(channel.nid, channel)
        if (alreadySubscribed) {
            return
        }
        if (this.pendingChannelCloses.has(channel.nid)) {
            this.pendingChannelOpens.add(channel.nid)
            return
        }
        if (!this.knownChannelIds.has(channel.nid)) {
            this.pendingChannelOpens.add(channel.nid)
        }
    }

    /** @internal */
    unsubscribe(channel: IChannel) {
        if (this.subscriptions.get(channel.nid) !== channel) {
            return
        }
        this.subscriptions.delete(channel.nid)
        this.scopedMessageQueue = this.scopedMessageQueue.filter(queued => queued.channelId !== channel.nid)
        this.scopedInterpolatedMessageQueue = this.scopedInterpolatedMessageQueue.filter(queued => queued.channelId !== channel.nid)
        const pendingOpen = this.pendingChannelOpens.delete(channel.nid)
        if (!pendingOpen && this.knownChannelIds.has(channel.nid)) {
            this.pendingChannelCloses.add(channel.nid)
        }
        this.knownChannelHeaderVersions.delete(channel.nid)
    }

    /** @internal */
    queueEngineMessage(engineMessage: any) {
        this.engineMessageQueue.push(engineMessage)
    }

    queueMessage(message: any) {
        this.messageQueue.push(message)
    }

    /** Queues for the current subscription; unsubscribe cancels unsent scoped messages. */
    queueChannelMessage(channelId: number, message: any) {
        if (!this.subscriptions.has(channelId)) return
        this.scopedMessageQueue.push({ channelId, message })
    }

    queueInterpolatedMessage(message: any) {
        this.interpolatedMessageQueue.push(message)
    }

    /** Queues for the current subscription; unsubscribe cancels unsent scoped messages. */
    queueChannelInterpolatedMessage(channelId: number, message: any) {
        if (!this.subscriptions.has(channelId)) return
        this.scopedInterpolatedMessageQueue.push({ channelId, message })
    }

    /** @internal */
    hasPendingChannelOpens() {
        return this.pendingChannelOpens.size > 0
    }

    /** @internal */
    consumePendingChannelOpens() {
        const opens = Array.from(this.pendingChannelOpens)
        this.pendingChannelOpens.clear()
        return opens
    }

    /** @internal */
    hasPendingChannelCloses() {
        return this.pendingChannelCloses.size > 0
    }

    /** @internal */
    consumePendingChannelCloses() {
        const deletes = Array.from(this.pendingChannelCloses)
        this.pendingChannelCloses.clear()
        return deletes
    }

    /** @internal */
    send(buffer: BinaryPayload) {
        this.networkAdapter.send(this, buffer)
    }

    disconnect(reason: StringOrJSONStringifiable) {
        if (this.network) {
            this.network.disconnectUser(this, reason)
        } else {
            this.networkAdapter.disconnect(this, reason)
        }
    }

}
