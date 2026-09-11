import { Instance } from './Instance'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { User, UserConnectionState } from './User'
import type { CommandTimingEstimate, CommandTimingInput } from './User'
import { BinarySection } from '../common/binary/BinarySection'
import { EngineMessage, MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET, MAX_CLIENT_PACKET_SECTIONS } from '../common/EngineMessage'
import readEngineMessage from '../binary/message/readEngineMessage'
import readMessage from '../binary/message/readMessage'
import countMessage from '../binary/message/count'
import { writeMessage } from '../binary/message/writeMessage'
import { BinaryPayload } from '../common/binary/BinaryAdapter'
import { binaryGet } from '../common/binary/BinaryExt'
import { Binary } from '../common/binary/Binary'
import { ProtocolConfig, WIRE_PROTOCOL_VERSION } from '../common/binary/Protocol'
import { countEndpointPayload, createEndpointPayload, readSizedEndpointPayload, skipEndpointPayload } from '../binary/endpoint/EndpointPayload'
import { ResponseStatus } from '../common/Endpoint'
import type { ResponseEndpoint } from './Instance'
import { createSchemaFingerprint } from '../common/binary/schema/schemaFingerprint'
import { NQueue } from '../NQueue'
import { NetworkLimitError, NetworkLimits } from './NetworkLimits'
import type { SnapshotResponse } from '../binary/snapshot/SnapshotPlan'
import { copyNObject } from '../common/binary/schema/util'

export interface INetworkEvent {
    type: NetworkEvent
    user: User
    commands?: any
    commandFrameNumber?: number
    commandTimings?: Array<CommandTimingEstimate | undefined>
    serverReceivedTimeMs?: number
    payload?: any
    reason?: any
}

export interface INetworkRequest {
    user: User
    requestId: number
    endpointId: number
    endpoint?: ResponseEndpoint
    body?: any
}

export type ResponseBacklogInfo = {
    user: User
    queued: number
    sent: number
    remaining: number
    tick: number
}

export type SnapshotPerformanceSample = {
    collectMs: number
    countMs: number
    writeMs: number
    commitMs: number
    sendMs: number
    bytes: number
    creates: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
    deletes: number
    messages: number
    engineMessages: number
    responses: number
}

export type SnapshotPerformanceWindow = {
    snapshots: number
    sharedSnapshots: number
    collectTotalMs: number
    collectMaxMs: number
    countTotalMs: number
    countMaxMs: number
    writeTotalMs: number
    writeMaxMs: number
    commitTotalMs: number
    commitMaxMs: number
    sendTotalMs: number
    sendMaxMs: number
    bytesTotal: number
    bytesMax: number
    createsTotal: number
    updatePropsTotal: number
    updateGroupsTotal: number
    groupedUpdatePropsTotal: number
    deletesTotal: number
    messagesTotal: number
    messagesMax: number
    engineMessagesTotal: number
    engineMessagesMax: number
    responsesTotal: number
    responsesMax: number
    sharedMessageFragmentBuilds: number
    sharedMessageFragmentHits: number
    sharedMessageFragmentCountTotalMs: number
    sharedMessageFragmentCountMaxMs: number
    sharedMessageFragmentWriteTotalMs: number
    sharedMessageFragmentWriteMaxMs: number
    sharedMessageFragmentBytesTotal: number
    sharedMessageFragmentBytesMax: number
    sharedMessageFragmentCopyTotalMs: number
    sharedMessageFragmentCopyMaxMs: number
    sharedMessageFragmentCopyBytesTotal: number
    sharedMessageFragmentMessagesTotal: number
    sharedFragmentBuilds: number
    sharedFragmentHits: number
    sharedFragmentCollectTotalMs: number
    sharedFragmentCollectMaxMs: number
    sharedFragmentCountTotalMs: number
    sharedFragmentCountMaxMs: number
    sharedFragmentWriteTotalMs: number
    sharedFragmentWriteMaxMs: number
    sharedFragmentBytesTotal: number
    sharedFragmentBytesMax: number
    sharedFragmentCopyTotalMs: number
    sharedFragmentCopyMaxMs: number
    sharedFragmentCopyBytesTotal: number
}

export type SharedSnapshotFragment = {
    payload: BinaryPayload
    bytes: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
}

export type SharedMessageFragment = {
    payload: BinaryPayload
    bytes: number
    messages: number
}

export type SharedCreateFragment = {
    payload: BinaryPayload
    bytes: number
    creates: number
    nids: Set<number>
}

export type SharedDeleteFragment = {
    payload: BinaryPayload
    bytes: number
    deletes: number
    nids: Set<number>
}

function createSnapshotPerformanceWindow(): SnapshotPerformanceWindow {
    return {
        snapshots: 0,
        sharedSnapshots: 0,
        collectTotalMs: 0,
        collectMaxMs: 0,
        countTotalMs: 0,
        countMaxMs: 0,
        writeTotalMs: 0,
        writeMaxMs: 0,
        commitTotalMs: 0,
        commitMaxMs: 0,
        sendTotalMs: 0,
        sendMaxMs: 0,
        bytesTotal: 0,
        bytesMax: 0,
        createsTotal: 0,
        updatePropsTotal: 0,
        updateGroupsTotal: 0,
        groupedUpdatePropsTotal: 0,
        deletesTotal: 0,
        messagesTotal: 0,
        messagesMax: 0,
        engineMessagesTotal: 0,
        engineMessagesMax: 0,
        responsesTotal: 0,
        responsesMax: 0,
        sharedMessageFragmentBuilds: 0,
        sharedMessageFragmentHits: 0,
        sharedMessageFragmentCountTotalMs: 0,
        sharedMessageFragmentCountMaxMs: 0,
        sharedMessageFragmentWriteTotalMs: 0,
        sharedMessageFragmentWriteMaxMs: 0,
        sharedMessageFragmentBytesTotal: 0,
        sharedMessageFragmentBytesMax: 0,
        sharedMessageFragmentCopyTotalMs: 0,
        sharedMessageFragmentCopyMaxMs: 0,
        sharedMessageFragmentCopyBytesTotal: 0,
        sharedMessageFragmentMessagesTotal: 0,
        sharedFragmentBuilds: 0,
        sharedFragmentHits: 0,
        sharedFragmentCollectTotalMs: 0,
        sharedFragmentCollectMaxMs: 0,
        sharedFragmentCountTotalMs: 0,
        sharedFragmentCountMaxMs: 0,
        sharedFragmentWriteTotalMs: 0,
        sharedFragmentWriteMaxMs: 0,
        sharedFragmentBytesTotal: 0,
        sharedFragmentBytesMax: 0,
        sharedFragmentCopyTotalMs: 0,
        sharedFragmentCopyMaxMs: 0,
        sharedFragmentCopyBytesTotal: 0
    }
}

function countStringBytes(value: string) {
    return binaryGet(Binary.String).byteSize(value)
}

function errorPayload(code: string, message: string) {
    return { code, message }
}

function isUserClosed(user: User) {
    return user.connectionState === UserConnectionState.Closed
}

function serializeConnectionError(err: any) {
    if (err instanceof Error) {
        return JSON.stringify({
            name: err.name,
            message: err.message
        })
    }
    return JSON.stringify(err)
}

class ProtocolError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProtocolError'
    }
}

export class InstanceNetwork {
    instance: Instance
    pendingUsers = new Set<User>()
    private deniedUsers = new WeakSet<User>()
    responseBacklogUsers = new Set<User>()
    requestQueue = new NQueue<INetworkRequest>(request => this.releaseQueuedInput(request))
    queuedCommandCount = 0
    queuedInputBytes = 0
    queuedResponseCount = 0
    queuedResponseBytes = 0
    private inputCharges = new WeakMap<object, { bytes: number, commands: number, requests: number }>()
    private responseCharges = new WeakMap<SnapshotResponse, number>()
    requireSchemaFingerprint = false
    // Rerun failed snapshot writes with field-level context. Keep off for the
    // normal fast path because it disables shared binary fragments.
    diagnosticBinaryWrites = false
    sharedUpdateFragmentsEnabled = false
    sharedUpdateFragments: Map<string, SharedSnapshotFragment> = new Map()
    sharedCreateFragments: Map<string, SharedCreateFragment> = new Map()
    sharedDeleteFragments: Map<string, SharedDeleteFragment> = new Map()
    sharedMessageFragments: Map<string, SharedMessageFragment> = new Map()
    /**
     * Disabled by default because each sample takes several high-resolution
     * clock reads per user. The fields intentionally mirror the snapshot
     * pipeline so stress tests can tell whether time is going to visibility
     * and plan collection, exact byte counting, binary writing, commit work,
     * or the adapter send call.
     */
    snapshotPerformanceEnabled = false
    snapshotPerformance = createSnapshotPerformanceWindow()
    onResponseBacklog: (info: ResponseBacklogInfo) => void = (info: ResponseBacklogInfo) => {
        console.warn(
            `nengi response backlog: ${info.remaining} responses remain queued for user ${info.user.id} after sending ${info.sent} of ${info.queued} on server tick ${info.tick}.`
        )
    }

    constructor(instance: Instance) {
        this.instance = instance
    }

    recordSnapshotPerformance(sample: SnapshotPerformanceSample) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.snapshots++
        metrics.collectTotalMs += sample.collectMs
        metrics.collectMaxMs = Math.max(metrics.collectMaxMs, sample.collectMs)
        metrics.countTotalMs += sample.countMs
        metrics.countMaxMs = Math.max(metrics.countMaxMs, sample.countMs)
        metrics.writeTotalMs += sample.writeMs
        metrics.writeMaxMs = Math.max(metrics.writeMaxMs, sample.writeMs)
        metrics.commitTotalMs += sample.commitMs
        metrics.commitMaxMs = Math.max(metrics.commitMaxMs, sample.commitMs)
        metrics.sendTotalMs += sample.sendMs
        metrics.sendMaxMs = Math.max(metrics.sendMaxMs, sample.sendMs)
        metrics.bytesTotal += sample.bytes
        metrics.bytesMax = Math.max(metrics.bytesMax, sample.bytes)
        metrics.createsTotal += sample.creates
        metrics.updatePropsTotal += sample.updateProps
        metrics.updateGroupsTotal += sample.updateGroups
        metrics.groupedUpdatePropsTotal += sample.groupedUpdateProps
        metrics.deletesTotal += sample.deletes
        metrics.messagesTotal += sample.messages
        metrics.messagesMax = Math.max(metrics.messagesMax, sample.messages)
        metrics.engineMessagesTotal += sample.engineMessages
        metrics.engineMessagesMax = Math.max(metrics.engineMessagesMax, sample.engineMessages)
        metrics.responsesTotal += sample.responses
        metrics.responsesMax = Math.max(metrics.responsesMax, sample.responses)
    }

    recordSharedSnapshot() {
        if (!this.snapshotPerformanceEnabled) {
            return
        }
        this.snapshotPerformance.sharedSnapshots++
    }

    recordSharedFragmentHit() {
        if (!this.snapshotPerformanceEnabled) {
            return
        }
        this.snapshotPerformance.sharedFragmentHits++
    }

    recordSharedFragmentBuild(sample: {
        collectMs: number
        countMs: number
        writeMs: number
        bytes: number
    }) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedFragmentBuilds++
        metrics.sharedFragmentCollectTotalMs += sample.collectMs
        metrics.sharedFragmentCollectMaxMs = Math.max(metrics.sharedFragmentCollectMaxMs, sample.collectMs)
        metrics.sharedFragmentCountTotalMs += sample.countMs
        metrics.sharedFragmentCountMaxMs = Math.max(metrics.sharedFragmentCountMaxMs, sample.countMs)
        metrics.sharedFragmentWriteTotalMs += sample.writeMs
        metrics.sharedFragmentWriteMaxMs = Math.max(metrics.sharedFragmentWriteMaxMs, sample.writeMs)
        metrics.sharedFragmentBytesTotal += sample.bytes
        metrics.sharedFragmentBytesMax = Math.max(metrics.sharedFragmentBytesMax, sample.bytes)
    }

    recordSharedFragmentCopy(copyMs: number, bytes: number) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedFragmentCopyTotalMs += copyMs
        metrics.sharedFragmentCopyMaxMs = Math.max(metrics.sharedFragmentCopyMaxMs, copyMs)
        metrics.sharedFragmentCopyBytesTotal += bytes
    }

    recordSharedMessageFragmentHit() {
        if (!this.snapshotPerformanceEnabled) {
            return
        }
        this.snapshotPerformance.sharedMessageFragmentHits++
    }

    recordSharedMessageFragmentBuild(sample: {
        countMs: number
        writeMs: number
        bytes: number
        messages: number
    }) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedMessageFragmentBuilds++
        metrics.sharedMessageFragmentCountTotalMs += sample.countMs
        metrics.sharedMessageFragmentCountMaxMs = Math.max(metrics.sharedMessageFragmentCountMaxMs, sample.countMs)
        metrics.sharedMessageFragmentWriteTotalMs += sample.writeMs
        metrics.sharedMessageFragmentWriteMaxMs = Math.max(metrics.sharedMessageFragmentWriteMaxMs, sample.writeMs)
        metrics.sharedMessageFragmentBytesTotal += sample.bytes
        metrics.sharedMessageFragmentBytesMax = Math.max(metrics.sharedMessageFragmentBytesMax, sample.bytes)
        metrics.sharedMessageFragmentMessagesTotal += sample.messages
    }

    recordSharedMessageFragmentCopy(copyMs: number, bytes: number) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedMessageFragmentCopyTotalMs += copyMs
        metrics.sharedMessageFragmentCopyMaxMs = Math.max(metrics.sharedMessageFragmentCopyMaxMs, copyMs)
        metrics.sharedMessageFragmentCopyBytesTotal += bytes
    }

    recordSnapshotSend(sendMs: number) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sendTotalMs += sendMs
        metrics.sendMaxMs = Math.max(metrics.sendMaxMs, sendMs)
    }

    resetSnapshotPerformance() {
        this.snapshotPerformance = createSnapshotPerformanceWindow()
    }

    resetSharedUpdateFragments() {
        this.sharedUpdateFragments.clear()
        this.sharedCreateFragments.clear()
        this.sharedDeleteFragments.clear()
        this.sharedMessageFragments.clear()
    }

    getProtocol(): ProtocolConfig {
        return {
            nidType: this.instance.localState.nidType,
            ntypeType: this.instance.context.ntypeType
        }
    }

    createProtocolEngineMessage() {
        const protocol = this.getProtocol()
        return {
            ntype: EngineMessage.Protocol,
            nidType: protocol.nidType,
            ntypeType: protocol.ntypeType
        }
    }

    queueProtocolIfChanged(user: User) {
        const protocol = this.getProtocol()
        if (user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType) {
            user.queueEngineMessage(this.createProtocolEngineMessage())
            user.protocol = { ...protocol }
        }
    }

    queueResponse(user: User, requestId: number, endpoint: ResponseEndpoint, response: any) {
        if (user.connectionState !== UserConnectionState.Open) return
        this.enqueueResponse(user, {
            requestId,
            status: ResponseStatus.Ok,
            payload: createEndpointPayload(response, endpoint.endpoint?.responseSchema)
        })
    }

    queueErrorResponse(user: User, requestId: number, code: string, message: string) {
        if (user.connectionState !== UserConnectionState.Open) return
        this.enqueueResponse(user, {
            requestId,
            status: ResponseStatus.Error,
            payload: createEndpointPayload(errorPayload(code, message))
        })
    }

    private enqueueResponse(user: User, response: SnapshotResponse) {
        if (user.connectionState !== UserConnectionState.Open) return
        try {
            this.checkLimit('maxQueuedResponsesPerUser', user.responseQueue.length + 1)
            this.checkLimit('maxQueuedResponses', this.queuedResponseCount + 1)
            const bytes = 9 + countEndpointPayload(response.payload)
            if (!Number.isSafeInteger(bytes) || bytes < 9) throw new Error('Invalid response byte length.')
            this.checkLimit('maxQueuedResponseBytesPerUser', user.queuedResponseBytes + bytes)
            this.checkLimit('maxQueuedResponseBytes', this.queuedResponseBytes + bytes)
            // Stabilize the byte charge and queued value against later game edits.
            if (response.payload.kind === 'schema') {
                response.payload.value = copyNObject(response.payload.value, response.payload.schema)
            }
            this.responseCharges.set(response, bytes)
            user.queuedResponseBytes += bytes
            this.queuedResponseBytes += bytes
            this.queuedResponseCount++
            user.responseQueue.push(response)
        } catch (error) {
            if (error instanceof NetworkLimitError) this.rejectLimit(user, error)
            else throw error
        }
    }

    releaseQueuedResponse(user: User, response: SnapshotResponse) {
        const bytes = this.responseCharges.get(response)
        if (bytes === undefined) return
        this.responseCharges.delete(response)
        user.queuedResponseBytes -= bytes
        this.queuedResponseBytes -= bytes
        this.queuedResponseCount--
    }

    releaseQueuedInput(item: INetworkEvent | INetworkRequest) {
        const charge = this.inputCharges.get(item)
        if (!charge) return
        this.inputCharges.delete(item)
        item.user.queuedInputBytes -= charge.bytes
        item.user.queuedCommandCount -= charge.commands
        item.user.queuedRequestCount -= charge.requests
        this.queuedInputBytes -= charge.bytes
        this.queuedCommandCount -= charge.commands
    }

    private chargeInput(item: INetworkEvent | INetworkRequest, bytes: number, commands: number, requests: number) {
        this.inputCharges.set(item, { bytes, commands, requests })
        item.user.queuedInputBytes += bytes
        item.user.queuedCommandCount += commands
        item.user.queuedRequestCount += requests
        this.queuedInputBytes += bytes
        this.queuedCommandCount += commands
    }

    private checkLimit(limit: keyof NetworkLimits, value: number) {
        const maximum = this.instance.limits[limit]
        if (value > maximum) throw new NetworkLimitError(limit, value, maximum)
    }

    private checkInputBytes(user: User, bytes: number) {
        this.checkLimit('maxQueuedInputBytesPerUser', user.queuedInputBytes + bytes)
        this.checkLimit('maxQueuedInputBytes', this.queuedInputBytes + bytes)
    }

    private eventSlotsUsed() {
        return this.instance.queue.length + this.instance.users.size + 2 * this.pendingUsers.size
    }

    private rejectLimit(user: User, error: NetworkLimitError) {
        this.disconnectUser(user, { reason: 'network_limit', limit: error.limit }, true)
        try {
            this.instance.onNetworkLimit({ user, limit: error.limit, value: error.value, maximum: error.maximum })
        } catch (observerError) {
            // Diagnostics cannot interfere with cleanup or other connections.
        }
    }

    private admitPacket(user: User, bytes: number, nowMs: number) {
        this.checkLimit('maxPacketBytes', bytes)
        const limits = this.instance.limits
        if (user.inboundRateTimeMs === null) {
            user.inboundRateTimeMs = nowMs
            user.inboundPacketTokens = limits.packetBurst
            user.inboundByteTokens = limits.byteBurst
        }
        const elapsed = Math.max(0, nowMs - user.inboundRateTimeMs) / 1000
        user.inboundRateTimeMs = Math.max(nowMs, user.inboundRateTimeMs)
        user.inboundPacketTokens = Math.min(limits.packetBurst, user.inboundPacketTokens + elapsed * limits.packetsPerSecond)
        user.inboundByteTokens = Math.min(limits.byteBurst, user.inboundByteTokens + elapsed * limits.bytesPerSecond)
        if (user.inboundPacketTokens < 1) {
            throw new NetworkLimitError('packetBurst', limits.packetBurst - user.inboundPacketTokens + 1, limits.packetBurst)
        }
        if (user.inboundByteTokens < bytes) {
            throw new NetworkLimitError('byteBurst', limits.byteBurst - user.inboundByteTokens + bytes, limits.byteBurst)
        }
        user.inboundPacketTokens--
        user.inboundByteTokens -= bytes
    }

    reportResponseBacklog(user: User, queued: number, sent: number) {
        const remaining = user.responseQueue.length
        if (remaining === 0) {
            this.responseBacklogUsers.delete(user)
            return
        }
        if (!this.responseBacklogUsers.has(user)) {
            this.responseBacklogUsers.add(user)
            this.onResponseBacklog({
                user,
                queued,
                sent,
                remaining,
                tick: this.instance.tick
            })
        }
    }

    runRequestHandler(user: User, requestId: number, endpoint: ResponseEndpoint, body: any) {
        let sent = false
        const send = (response: any) => {
            if (sent || user.connectionState !== UserConnectionState.Open) {
                return
            }
            sent = true
            this.queueResponse(user, requestId, endpoint, response)
        }

        try {
            const result = endpoint.callback({ user, body }, send)
            if (result && typeof (result as Promise<any>).then === 'function') {
                const pending = result as Promise<any>
                pending
                    .then(response => {
                        if (response !== undefined) {
                            send(response)
                        }
                    })
                    .catch(() => {
                        if (!sent && user.connectionState === UserConnectionState.Open) {
                            this.queueErrorResponse(user, requestId, 'HANDLER_REJECTED', 'Request handler rejected.')
                        }
                    })
            } else if (result !== undefined) {
                send(result)
            }
        } catch (err) {
            if (!sent && user.connectionState === UserConnectionState.Open) {
                this.queueErrorResponse(user, requestId, 'HANDLER_ERROR', 'Request handler errored.')
            }
        }
    }

    processRequests(max = Number.POSITIVE_INFINITY) {
        let processed = 0
        while (processed < max && !this.requestQueue.isEmpty()) {
            const request = this.requestQueue.next()
            processed++
            if (request.user.connectionState !== UserConnectionState.Open) {
                continue
            }
            if (!request.endpoint) {
                this.queueErrorResponse(request.user, request.requestId, 'NO_ENDPOINT', 'No response handler is registered for this endpoint.')
                continue
            }
            this.runRequestHandler(request.user, request.requestId, request.endpoint, request.body)
        }
        return processed
    }

    onOpen(user: User) {
        if (user.connectionState === UserConnectionState.Closed || this.pendingUsers.has(user) || this.isUserlandConnected(user)) return
        user.connectionState = UserConnectionState.OpenPreHandshake
        user.network = this
        user.openedAtMs = this.instance.now()
        try {
            this.checkLimit('maxConnections', this.pendingUsers.size + this.instance.users.size + 1)
            this.checkLimit('maxPendingConnections', this.pendingUsers.size + 1)
            this.checkLimit('maxQueuedEvents', this.eventSlotsUsed() + 2)
            this.pendingUsers.add(user)
        } catch (error) {
            if (error instanceof NetworkLimitError) this.rejectLimit(user, error)
            else throw error
        }
    }

    async onHandshake(
        user: User,
        handshake: any,
        clientSchemaFingerprint = '',
        clientWireProtocolVersion = WIRE_PROTOCOL_VERSION
    ) {
        try {
            if (user.connectionState !== UserConnectionState.OpenPreHandshake) {
                throw new Error('Connection attempt received when the connection is not awaiting its initial handshake.')
            }
            if (!this.pendingUsers.has(user)) this.onOpen(user)
            if (isUserClosed(user)) return
            user.connectionState = UserConnectionState.OpenAwaitingHandshake
            this.pendingUsers.add(user)
            if (clientWireProtocolVersion !== WIRE_PROTOCOL_VERSION) {
                throw new Error(
                    `Nengi wire protocol mismatch. Server ${WIRE_PROTOCOL_VERSION}, ` +
                    `client ${clientWireProtocolVersion}.`
                )
            }
            if (this.requireSchemaFingerprint) {
                const serverSchemaFingerprint = createSchemaFingerprint(this.instance.context)
                if (!clientSchemaFingerprint) {
                    throw new Error(`Schema fingerprint required. Server fingerprint ${serverSchemaFingerprint}.`)
                }
                if (clientSchemaFingerprint !== serverSchemaFingerprint) {
                    throw new Error(`Schema fingerprint mismatch. Client ${clientSchemaFingerprint}, server ${serverSchemaFingerprint}.`)
                }
            }

            const connectionAccepted = await this.instance.onConnect(handshake)

            if (connectionAccepted === false) {
                throw new Error('Connection denied.')
            }

            if (isUserClosed(user)) {
                return
            }

            this.sendConnectionAccepted(user)
            if (isUserClosed(user)) return
            user.instance = this.instance
            user.protocol = { ...this.getProtocol() }
            this.onConnectionAccepted(user, connectionAccepted)
        } catch (err: any) {
            if (this.isUserlandConnected(user)) {
                this.disconnectUser(user, {}, false)
                return
            }
            if (user.connectionState === UserConnectionState.Closed) {
                return
            }
            this.onConnectionDenied(user, err)
            this.sendConnectionDenied(user, err)
            this.disconnectDeniedUser(user)
        }
    }

    private sendConnectionAccepted(user: User) {
        const acceptedMessage = {
            ntype: EngineMessage.ConnectionAccepted,
            wireProtocolVersion: WIRE_PROTOCOL_VERSION
        }
        const protocolMessage = this.createProtocolEngineMessage()
        const acceptedSchema = this.instance.context.getEngineSchema(acceptedMessage.ntype)!
        const protocolSchema = this.instance.context.getEngineSchema(protocolMessage.ntype)!
        const byteLength = 2 +
            countMessage(acceptedSchema, acceptedMessage) +
            countMessage(protocolSchema, protocolMessage)
        const writer = user.networkAdapter.binary.createWriter(byteLength)
        writer.writeUInt8(BinarySection.EngineMessages)
        writer.writeUInt8(2)
        writeMessage(acceptedMessage, acceptedSchema, writer)
        writeMessage(protocolMessage, protocolSchema, writer)
        user.send(writer.payload)
    }

    private sendConnectionDenied(user: User, error: unknown) {
        try {
            const jsonError = serializeConnectionError(error)
            const writer = user.networkAdapter.binary.createWriter(3 + countStringBytes(jsonError))
            writer.writeUInt8(BinarySection.EngineMessages)
            writer.writeUInt8(1)
            writer.writeUInt8(EngineMessage.ConnectionDenied)
            writer.writeString(jsonError)
            user.send(writer.payload)
        } catch (sendError) {
            // The denial event and transport cleanup remain authoritative.
        }
    }

    /** Admission for native WebSocket Ping/Pong callbacks, not nengi clock Pongs. */
    onTransportControl(user: User, byteLength: number): boolean {
        if (user.connectionState === UserConnectionState.Closed) return false
        try {
            const now = this.instance.now()
            if (!Number.isFinite(now) || !Number.isSafeInteger(byteLength) || byteLength < 0) {
                throw new Error('Invalid transport control metadata.')
            }
            this.admitPacket(user, byteLength, now)
            return true
        } catch (error) {
            if (error instanceof NetworkLimitError) this.rejectLimit(user, error)
            else this.disconnectUser(user, { reason: 'invalid_transport_control' }, true)
            return false
        }
    }

    onMessage(user: User, buffer: BinaryPayload) {
        if (user.connectionState === UserConnectionState.Closed) return
        try {
            const serverReceivedTimeMs = this.instance.now()
            if (!Number.isFinite(serverReceivedTimeMs)) throw new Error('instance.now must return a finite time.')
            this.admitPacket(user, buffer.byteLength, serverReceivedTimeMs)
            const binaryReader = user.networkAdapter.binary.createReader(buffer)
            const commands: any[] = []
            const commandTimingInputs: Array<CommandTimingInput | undefined> = []
            let engineMessageCount = 0
            let sectionCount = 0
            let receivedCommandFrameNumber: number | undefined
            let interpolationDelay: number | undefined
            let pongs: Array<{ pingId: number, clientReceiveTimeMs: number, clientSendTimeMs: number }> | undefined
            let connectionAttempt: { handshake: any, schemaFingerprint: string, wireProtocolVersion: number } | undefined

            const commandSet = {
                type: NetworkEvent.CommandSet,
                user,
                commands,
                commandFrameNumber: -1,
                commandTimings: [] as Array<CommandTimingEstimate | undefined>,
                serverReceivedTimeMs
            }

            while (binaryReader.offset < binaryReader.byteLength) {
                if (++sectionCount > MAX_CLIENT_PACKET_SECTIONS) throw new ProtocolError('Too many client packet sections.')
                const section = binaryReader.readUInt8()

                switch (section) {
                case BinarySection.EngineMessages: {
                    const count = binaryReader.readUInt8()
                    engineMessageCount += count
                    if (engineMessageCount > MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET) {
                        throw new ProtocolError('Too many client engine messages in one packet.')
                    }
                    for (let i = 0; i < count; i++) {
                        // Check direction and state before allocating/decoding the body.
                        const ntype = binaryReader.readUInt8()
                        if (ntype === EngineMessage.ConnectionAttempt) {
                            if (connectionAttempt || user.connectionState !== UserConnectionState.OpenPreHandshake) {
                                throw new ProtocolError('Connection attempt received when the connection is not awaiting its initial handshake.')
                            }
                        } else {
                            if (ntype !== EngineMessage.CommandFrameNumber && ntype !== EngineMessage.Pong &&
                                ntype !== EngineMessage.CommandTiming && ntype !== EngineMessage.InterpolationDelay) {
                                throw new ProtocolError('Engine message is not permitted from a client.')
                            }
                            if (user.connectionState !== UserConnectionState.Open) {
                                throw new ProtocolError('Gameplay engine message received before the connection was open.')
                            }
                        }
                        const msg: any = readEngineMessage(binaryReader, this.instance.context, ntype)
                        switch (ntype) {
                        case EngineMessage.ConnectionAttempt:
                            connectionAttempt = {
                                handshake: JSON.parse(msg.handshake),
                                schemaFingerprint: msg.schemaFingerprint || '',
                                wireProtocolVersion: msg.wireProtocolVersion
                            }
                            break
                        case EngineMessage.CommandFrameNumber:
                            if (receivedCommandFrameNumber !== undefined || msg.commandFrameNumber <= user.lastReceivedCommandFrameNumber) {
                                throw new ProtocolError('Command frame numbers must advance once per packet.')
                            }
                            receivedCommandFrameNumber = msg.commandFrameNumber
                            break
                        case EngineMessage.Pong:
                            if (!Number.isFinite(msg.clientReceiveTimeMs) || !Number.isFinite(msg.clientSendTimeMs) ||
                                msg.clientSendTimeMs < msg.clientReceiveTimeMs) {
                                throw new ProtocolError('Invalid Pong timestamps.')
                            }
                            if (!pongs) pongs = []
                            pongs.push(msg)
                            break
                        case EngineMessage.CommandTiming:
                            if (commandTimingInputs[msg.commandIndex]) {
                                throw new ProtocolError('Duplicate timing for one command.')
                            }
                            if (!Number.isFinite(msg.clientTimeMs) || !Number.isFinite(msg.renderDelayMs) ||
                                !Number.isFinite(msg.viewTick) || !Number.isFinite(msg.viewServerTimeMs) || msg.renderDelayMs < 0) {
                                throw new ProtocolError('Invalid command timing.')
                            }
                            commandTimingInputs[msg.commandIndex] = msg
                            break
                        case EngineMessage.InterpolationDelay:
                            if (interpolationDelay !== undefined || !Number.isFinite(msg.delayMs) || msg.delayMs < 0) {
                                throw new ProtocolError('Invalid or duplicate interpolation delay.')
                            }
                            interpolationDelay = msg.delayMs
                            break
                        }
                    }

                    break
                }
                case BinarySection.Commands: {
                    if (user.connectionState !== UserConnectionState.Open) {
                        throw new ProtocolError('Commands received before the connection was open.')
                    }
                    const count = binaryReader.readUInt8()
                    if (count > 0) {
                        this.checkLimit('maxQueuedCommandsPerUser', user.queuedCommandCount + commands.length + count)
                        this.checkLimit('maxQueuedCommands', this.queuedCommandCount + commands.length + count)
                        this.checkLimit('maxQueuedEvents', this.eventSlotsUsed() + 1)
                        this.checkInputBytes(user, buffer.byteLength)
                    }
                    for (let i = 0; i < count; i++) {
                        const msg = readMessage(binaryReader, this.instance.context, this.instance.context.ntypeType)
                        commands.push(msg)
                    }
                    break
                }
                case BinarySection.Requests: {
                    if (user.connectionState !== UserConnectionState.Open) {
                        throw new ProtocolError('Requests received before the connection was open.')
                    }
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const requestId = binaryReader.readUInt32()
                        const endpoint = binaryReader.readUInt32()
                        const payloadByteLength = binaryReader.readUInt32()
                        if (payloadByteLength > binaryReader.byteLength - binaryReader.offset) {
                            throw new ProtocolError('Request payload exceeds the remaining packet bytes.')
                        }
                        this.checkLimit('maxQueuedRequestsPerUser', user.queuedRequestCount + 1)
                        this.checkLimit('maxQueuedRequests', this.requestQueue.length + 1)
                        const bytes = 12 + payloadByteLength
                        this.checkInputBytes(user, bytes)
                        const responseEndpoint = this.instance.responseEndPoints.get(endpoint)
                        let request: INetworkRequest
                        if (!responseEndpoint) {
                            skipEndpointPayload(binaryReader, payloadByteLength)
                            request = { user, requestId, endpointId: endpoint }
                        } else {
                            const body = readSizedEndpointPayload(binaryReader, payloadByteLength, responseEndpoint.endpoint?.requestSchema)
                            request = {
                                user,
                                requestId,
                                endpointId: endpoint,
                                endpoint: responseEndpoint,
                                body
                            }
                        }
                        this.chargeInput(request, bytes, 0, 1)
                        this.requestQueue.enqueue(request)
                    }
                    break
                }
                default: {
                    throw new ProtocolError(`Unknown binary section ${section}.`)
                }
                }
            }

            // Validate the entire packet before applying engine controls. Requests
            // queued during decoding are purged by disconnect on any failure.
            if (commands.length > 0) this.checkInputBytes(user, buffer.byteLength)
            for (let i = 0; i < commandTimingInputs.length; i++) {
                if (commandTimingInputs[i] && i >= commands.length) {
                    throw new ProtocolError('Timing references a missing command.')
                }
            }
            if (pongs) {
                for (const pong of pongs) user.recordClockSyncPong(pong, serverReceivedTimeMs)
            }
            for (let i = 0; i < commandTimingInputs.length; i++) {
                const input = commandTimingInputs[i]
                if (input) commandSet.commandTimings[i] = user.estimateCommandTiming(input, serverReceivedTimeMs)
            }
            if (receivedCommandFrameNumber !== undefined) {
                commandSet.commandFrameNumber = user.receiveCommandFrameNumber(receivedCommandFrameNumber)
            }
            if (interpolationDelay !== undefined) user.recordInterpolationDelay(interpolationDelay, serverReceivedTimeMs)
            // Application authentication must not begin for a valid prefix of
            // a malformed packet. onHandshake owns the asynchronous outcome.
            if (connectionAttempt) {
                this.onHandshake(user, connectionAttempt.handshake, connectionAttempt.schemaFingerprint, connectionAttempt.wireProtocolVersion)
            }
            if (commands.length > 0) {
                this.checkInputBytes(user, buffer.byteLength)
                this.chargeInput(commandSet, buffer.byteLength, commands.length, 0)
                this.instance.queue.enqueue(commandSet)
            }
        } catch (err) {
            if (err instanceof NetworkLimitError) this.rejectLimit(user, err)
            else {
                this.notifyInboundMessageError(user, buffer, err)
                this.disconnectMalformedInboundUser(user)
            }
        }

    }

    disconnectMalformedInboundUser(user: User) {
        this.disconnectUser(user, {}, false)
    }

    notifyInboundMessageError(user: User, buffer: BinaryPayload, error: unknown) {
        try {
            this.instance.onInboundMessageError({
                user,
                error,
                byteLength: getPayloadByteLength(buffer),
                connectionState: user.connectionState
            })
        } catch (observerError) {
            // Error observers are diagnostic only; they must not let bad inbound
            // payloads crash the server.
        }
    }

    disconnectDeniedUser(user: User) {
        this.disconnectUser(user, {}, false)
    }

    disconnectSendFailedUser(user: User) {
        this.disconnectUser(user, {}, false)
    }

    disconnectTimedOutUsers(nowMs: number) {
        for (const user of Array.from(this.pendingUsers)) {
            if (
                (
                    user.connectionState === UserConnectionState.OpenPreHandshake ||
                    user.connectionState === UserConnectionState.OpenAwaitingHandshake
                ) &&
                user.openedAtMs !== null &&
                nowMs - user.openedAtMs >= this.instance.handshakeTimeoutMs
            ) {
                const reason = { reason: 'handshake_timeout' }
                this.onConnectionDenied(user, reason)
                this.disconnectUser(user, reason, true)
            }
        }

        for (const user of Array.from(this.instance.users.values())) {
            if (
                user.connectionState === UserConnectionState.Open &&
                user.hasPongTimedOut(nowMs, this.instance.pongTimeoutMs)
            ) {
                this.disconnectUser(user, { reason: 'pong_timeout' }, true)
            }
        }
    }

    disconnectUser(user: User, reason: any, force = false) {
        if (user.connectionState === UserConnectionState.Closed) {
            return
        }

        // Logical cleanup precedes transport callbacks, including synchronous
        // callbacks that try to disconnect the same user again.
        this.onClose(user, reason)
        try {
            if (force && user.networkAdapter.terminate) {
                user.networkAdapter.terminate(user, reason)
            } else {
                user.networkAdapter.disconnect(user, reason)
            }
        } catch (err) {
            // A close can fail before touching the socket (for example, an
            // invalid close reason). The user is no longer tracked for timeouts,
            // so try hard termination rather than leaving the transport open.
            if (!force && user.networkAdapter.terminate) {
                try {
                    user.networkAdapter.terminate(user, reason)
                } catch (terminateError) {
                    // Logical cleanup remains complete if the transport is broken.
                }
            }
        }
    }

    onConnectionAccepted(user: User, payload: any) {
        this.pendingUsers.delete(user)
        user.network = this
        user.id = ++this.instance.incrementalUserId
        user.connectionState = UserConnectionState.Open
        this.instance.users.set(user.id, user)

        this.instance.queue.enqueue({
            type: NetworkEvent.UserConnected,
            user,
            payload
        })
    }

    onConnectionDenied(user: User, payload: any) {
        if (this.deniedUsers.has(user) || this.isUserlandConnected(user)) {
            return
        }
        this.deniedUsers.add(user)
        this.pendingUsers.delete(user)
        this.instance.queue.enqueue({
            type: NetworkEvent.UserConnectionDenied,
            user,
            payload
        })
    }

    onClose(user: User, reason?: any) {
        user.connectionState = UserConnectionState.Closed
        this.pendingUsers.delete(user)
        this.responseBacklogUsers.delete(user)
        if (user.queuedRequestCount > 0) this.purgeRequestsForUser(user)
        for (const response of user.responseQueue) this.releaseQueuedResponse(user, response)
        user.responseQueue.length = 0
        for (const channel of Array.from(user.subscriptions.values())) {
            channel.unsubscribe(user)
        }
        if (this.isUserlandConnected(user)) {
            this.instance.users.delete(user.id)
            const eventReason = reason && typeof reason === 'object' && 'reason' in reason
                ? reason.reason
                : reason
            this.instance.queue.enqueue({
                type: NetworkEvent.UserDisconnected,
                user,
                reason: eventReason
            })
        }
    }

    private isUserlandConnected(user: User) {
        return this.instance.users.get(user.id) === user
    }

    purgeRequestsForUser(user: User) {
        return this.requestQueue.removeWhere(request => request.user === user)
    }
}

function getPayloadByteLength(payload: BinaryPayload) {
    return payload.byteLength
}
