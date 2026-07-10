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

export class User {
    id = 0
    socket: any
    instance: Instance | null = null
    networkAdapter: IServerNetworkAdapter<any, any, any>
    network: InstanceNetwork | null = null
    remoteAddress: string | null = null
    openedAtMs: number | null = null
    connectionState = UserConnectionState.NULL
    subscriptions = new Map<number, IChannel>()
    engineMessageQueue: any[] = []
    messageQueue: any[] = []
    interpolatedMessageQueue: any[] = []
    scopedMessageQueue: { channelId: number, message: any }[] = []
    scopedInterpolatedMessageQueue: { channelId: number, message: any }[] = []
    responseQueue: SnapshotResponse[] = []
    protocol: ProtocolConfig = { ...DEFAULT_PROTOCOL }
    knownChannelIds: Set<number> = new Set()
    knownChannelHeaderVersions: Map<number, number> = new Map()
    private pendingChannelOpens: Set<number> = new Set()
    private pendingChannelCloses: Set<number> = new Set()
    lastSentInstanceTick = 0
    lastReceivedCommandFrameNumber = 0
    nextPingId = 1
    lastSentPingId = 0
    latency = 0
    lastPingSentAtMs: number | null = null
    firstUnansweredPingSentAtMs: number | null = null
    lastPongReceivedAtMs: number | null = null
    pendingPings = new Map<number, { serverTimeMs: number, sentAtMs: number }>()
    recentLatencies: number[] = []
    latencySamples = 3
    roundTripMs = 0
    oneWayMs = 0
    minRoundTripMs = Number.POSITIVE_INFINITY
    clockOffsetMs = 0
    clockSyncSamples = 0
    interpolationDelayMs = 0
    lastInterpolationDelayTimeMs = 0

    constructor(socket: any, networkAdapter: IServerNetworkAdapter<any, any, any>) {
        this.socket = socket
        this.networkAdapter = networkAdapter
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

    shouldSendPing(nowMs: number, intervalMs: number) {
        return this.lastPingSentAtMs === null || nowMs - this.lastPingSentAtMs >= intervalMs
    }

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

    hasPongTimedOut(nowMs: number, timeoutMs: number) {
        const lastActivityAtMs = this.lastPongReceivedAtMs ?? this.firstUnansweredPingSentAtMs
        if (lastActivityAtMs === null) {
            return false
        }
        return nowMs - lastActivityAtMs >= timeoutMs
    }

    receiveCommandFrameNumber(commandFrameNumber: number) {
        if (commandFrameNumber <= 0) {
            return this.lastReceivedCommandFrameNumber
        }

        if (commandFrameNumber > this.lastReceivedCommandFrameNumber) {
            this.lastReceivedCommandFrameNumber = commandFrameNumber
        }
        return this.lastReceivedCommandFrameNumber
    }

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
            pong.clientSendTimeMs < pong.clientReceiveTimeMs
        ) {
            return false
        }

        this.pendingPings.delete(pong.pingId)
        this.lastPongReceivedAtMs = serverReceiveTimeMs

        const serverSendTimeMs = pendingPing.serverTimeMs
        const clientReceiveTimeMs = pong.clientReceiveTimeMs
        const clientSendTimeMs = pong.clientSendTimeMs
        const clientTurnaroundMs = Math.max(0, clientSendTimeMs - clientReceiveTimeMs)
        const roundTripMs = Math.max(0, (serverReceiveTimeMs - pendingPing.sentAtMs) - clientTurnaroundMs)
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
        if (this.pendingChannelCloses.has(channel.nid)) {
            this.pendingChannelOpens.add(channel.nid)
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

}
