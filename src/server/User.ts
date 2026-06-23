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

    constructor(socket: any, networkAdapter: IServerNetworkAdapter<any, any, any>) {
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

    nextPing() {
        const pingId = this.nextPingId
        this.nextPingId++
        if (this.nextPingId > 65535) {
            this.nextPingId = 1
        }
        this.lastSentPingId = pingId
        return pingId
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
