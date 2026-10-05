import { IEntity } from '../common/IEntity'
import { assertBinaryWriteSize } from '../binary/assertBinaryWriteSize'
import { ChannelType, createChannelHeader, hasSchemaBackedChannelHeader, mergeChannelHeaderData } from '../common/ChannelHeader'
import { SnapshotChannel } from '../binary/snapshot/SnapshotPlan'
import { NQueue } from '../NQueue'
import { Client } from './Client'
import type { RequestOptions } from './Client'
import { ClientConnectionError, ClientDisconnectInfo } from './ClientConnection'
import { Snapshot } from './Snapshot'
import { writeMessage } from '../binary/message/writeMessage'
import { connectionAttemptSchema } from '../common/schemas/connectAttemptSchema'
import readMessage from '../binary/message/readMessage'
import readDiff from '../binary/entity/readDiff'
import readUpdateGroup from '../binary/entity/readUpdateGroup'
import { IBinaryReader } from '../common/binary/IBinaryReader'
import { BinaryAdapter, BinaryPayload } from '../common/binary/BinaryAdapter'
import {
    DEFAULT_PROTOCOL,
    ProtocolConfig,
    WIRE_PROTOCOL_VERSION,
    assertNetworkIdType,
    readNetworkId
} from '../common/binary/Protocol'
import { EngineMessage, MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET } from '../common/EngineMessage'
import { BinarySection } from '../common/binary/BinarySection'
import count from '../binary/message/count'
import readEngineMessage from '../binary/message/readEngineMessage'
import { Outbound } from './Outbound'
import { Frame } from './Frame'
import { EntityStore } from './EntityStore'
import readEntity from '../binary/entity/readEntity'
import {
    countEndpointPayload,
    createEndpointPayload,
    EndpointPayload,
    readSizedEndpointPayload,
    skipEndpointPayload,
    writeEndpointPayload
} from '../binary/endpoint/EndpointPayload'
import {
    Endpoint,
    EndpointDefinition,
    MAX_UINT32,
    RequestError,
    RequestPolicy,
    ResponseStatus,
    getEndpointDefinition,
    getEndpointId,
    isValidUInt32
} from '../common/Endpoint'
import { readSnapshotHeader } from '../binary/snapshot/snapshotHeader'
import { getLocalTime } from './time'
import { createSchemaFingerprint } from '../common/binary/schema/schemaFingerprint'
import type { PredictionOperationOptions } from './prediction/Predictor'
import { PredictionOperationKind, PredictionOperationStatus } from './prediction/PredictionLog'

const MAX_REQUESTS_PER_FRAME = 255
const MAX_ENGINE_MESSAGES_PER_SECTION = 255

export type RequestBacklogInfo = {
    queued: number
    sent: number
    remaining: number
    frame: number
}

type ClientRequest<Response = any> = {
    endpoint: EndpointDefinition | null
    endpointId: number
    requestId: number
    payload: EndpointPayload
    resolve: (response: Response) => void
    reject: (reason: any) => void
    timeout: ReturnType<typeof setTimeout> | null
    key?: string
    promise: Promise<Response>
}

export type CommandTimingOptions = {
    /**
     * Local client time when the input was sampled. Defaults to now.
     * This is used by the server to estimate what the client was viewing when
     * it authored the command.
     */
    inputTimeMs?: number
    /**
     * Client interpolation/render delay in milliseconds at input time.
     */
    renderDelayMs?: number
    /**
     * Optional server frame/blend marker for games that want explicit view
     * frame timing. Relative-time lag compensation does not require it.
     */
    viewTick?: number
    /**
     * Optional estimated server time, in milliseconds, that the client was
     * viewing when the command was authored.
     */
    viewServerTimeMs?: number
}

export type InterpolationDelayReportOptions = {
    minIntervalMs?: number
    epsilonMs?: number
    force?: boolean
    now?: number
}

type HandshakeResponse = {
    denied?: boolean
    accepted: boolean
    clientData?: unknown
    reason?: any
}

type PendingResponse =
    | { request: ClientRequest, status: ResponseStatus.Ok, response: any }
    | { request: ClientRequest, status: ResponseStatus.Error, error: RequestError }

type PendingServerFrame = {
    snapshot: Snapshot
    receivedAtMs: number
    pendingResponses: PendingResponse[]
}

type PendingPong = {
    pingId: number
    clientReceiveTimeMs: number
}

type OutboundRollback = {
    commandFrameNumber: number
    outboundTick: number
    outboundEngineCommands: Map<number, any[]>
    outboundCommands: Map<number, any[]>
    outboundCommandTiming: Map<number, any[]>
    requestQueue: ClientRequest[]
    requestBacklogActive: boolean
    pendingPongs: PendingPong[]
}

export class ClientNetwork {
    /** @internal */
    client: Client
    readonly store: EntityStore
    /** @internal */
    entityNTypes: Map<number, number>
    private frameHistory: Frame[] = []

    /** Recent processed frames. Read-only views; use drainFrames/processNextFrame to consume arrivals. */
    get frames(): readonly Frame[] {
        return this.frameHistory
    }

    /** @internal */
    set frames(value: Frame[]) {
        this.frameHistory = value
    }
    /** @internal */
    pendingFrames: PendingServerFrame[] = []
    private observedLatestFrame: Frame | null = null
    /** @internal */
    outbound = new Outbound()
    /** @internal */
    requestId = 1
    /** @internal */
    requestQueue = new NQueue<ClientRequest>()
    /** @internal */
    requests = new Map<number, ClientRequest>()
    requestTimeoutMs = 10000
    /** @internal */
    requestBacklogActive = false
    /** @internal */
    protocol: ProtocolConfig = { ...DEFAULT_PROTOCOL }
    private observedCommandFrameNumber = 1 // monotonic public command-frame number
    /** @internal */
    frameTick = 1 // incremented each frame that comes from server
    maxFrameHistory = 240
    private observedLatency = 0
    private observedRoundTripMs = 0
    private observedServerTimeOffsetMs = 0
    private observedServerTimeSyncSamples = 0
    private observedInterpolationDelayMs = 0
    interpolationDelayReportIntervalMs = 500
    interpolationDelayReportEpsilonMs = 1
    private lastReportedInterpolationDelayMs = Number.NaN
    private lastInterpolationDelayReportAt = Number.NEGATIVE_INFINITY
    sendSchemaFingerprint = false
    private pendingOutboundRollback: OutboundRollback | null = null
    private pendingPongs: PendingPong[] = []
    private pendingTypeDeletes = new Set<number>()

    private sessionEnded = false
    private lastSentCommandFrameNumber = 0
    private lastSentAtMs = 0
    private watchedPredictionFrameNumber = 0
    private watchedPredictionSinceMs = 0
    private predictionWarningReported = false

    get latestFrame(): Frame | null {
        return this.observedLatestFrame
    }

    /** @internal */
    set latestFrame(value: Frame | null) {
        this.observedLatestFrame = value
    }

    get commandFrameNumber(): number {
        return this.observedCommandFrameNumber
    }

    /** @internal */
    set commandFrameNumber(value: number) {
        this.observedCommandFrameNumber = value
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

    get serverTimeOffsetMs(): number {
        return this.observedServerTimeOffsetMs
    }

    /** @internal */
    set serverTimeOffsetMs(value: number) {
        this.observedServerTimeOffsetMs = value
    }

    get serverTimeSyncSamples(): number {
        return this.observedServerTimeSyncSamples
    }

    /** @internal */
    set serverTimeSyncSamples(value: number) {
        this.observedServerTimeSyncSamples = value
    }

    get interpolationDelayMs(): number {
        return this.observedInterpolationDelayMs
    }

    /** @internal */
    set interpolationDelayMs(value: number) {
        this.observedInterpolationDelayMs = value
    }

    /** Logical teardown preserves the last applied state, never queued work. */
    /** @internal */
    endSession(info: ClientDisconnectInfo) {
        this.sessionEnded = true
        this.pendingFrames.length = 0
        this.pendingPongs.length = 0
        this.pendingTypeDeletes.clear()
        this.pendingOutboundRollback = null
        this.outbound.flush()
        this.requestQueue.clear()
        this.requestBacklogActive = false
        this.serverTimeOffsetMs = 0
        this.serverTimeSyncSamples = 0
        this.roundTripMs = 0
        this.latency = 0
        this.client.predictor.cancelSession()
        const error = new RequestError('Disconnected before the request completed; its server outcome is unknown.', 'DISCONNECTED', {
            payload: info
        })
        // Promise settlement invokes no user code synchronously. Do not turn
        // transport cancellation into a prediction's authoritative rejection.
        for (const request of this.requests.values()) {
            if (request.timeout !== null) clearTimeout(request.timeout)
            request.timeout = null
            request.reject(error)
        }
        this.requests.clear()
    }

    onRequestBacklog: (info: RequestBacklogInfo) => void = (info: RequestBacklogInfo) => {
        console.warn(
            `nengi request backlog: ${info.remaining} requests remain queued after sending ${info.sent} of ${info.queued} for command frame ${info.frame}.`
        )
    }

    /** @internal */
    constructor(client: Client, private readonly predictionWarningAfterMs: number | null = 2000, entityHistory = true) {
        if (predictionWarningAfterMs !== null && (!Number.isFinite(predictionWarningAfterMs) || predictionWarningAfterMs <= 0)) {
            throw new RangeError('predictionWarningAfterMs must be a positive finite duration in milliseconds, or null.')
        }
        this.client = client
        this.store = new EntityStore(client.context, entityHistory)
        this.entityNTypes = new Map()
        this.outbound.tick = this.commandFrameNumber
    }

    private nowMs() {
        return this.client.now ? this.client.now() : getLocalTime()
    }

    /** @internal */
    incrementCommandFrameNumber() {
        this.commandFrameNumber++
    }

    /** @internal */
    addEngineCommand(command: any) {
        this.outbound.addEngineCommand(command)
    }

    /** @internal */
    addCommand(command: any) {
        return this.outbound.addCommand(command)
    }

    /** @internal */
    addCommandWithTiming(command: any, options: CommandTimingOptions = {}) {
        return this.outbound.addCommandWithTiming(command, {
            clientTimeMs: options.inputTimeMs ?? this.nowMs(),
            renderDelayMs: options.renderDelayMs ?? 0,
            viewTick: options.viewTick ?? -1,
            viewServerTimeMs: options.viewServerTimeMs ?? -1
        })
    }

    /** @internal */
    reportInterpolationDelay(delayMs: number, options: InterpolationDelayReportOptions = {}) {
        if (!Number.isFinite(delayMs)) {
            return false
        }
        const now = options.now ?? this.nowMs()
        const minIntervalMs = options.minIntervalMs ?? this.interpolationDelayReportIntervalMs
        const epsilonMs = options.epsilonMs ?? this.interpolationDelayReportEpsilonMs
        const roundedDelayMs = Math.max(0, Math.round(delayMs))
        this.interpolationDelayMs = roundedDelayMs

        const changed = !Number.isFinite(this.lastReportedInterpolationDelayMs) ||
            Math.abs(roundedDelayMs - this.lastReportedInterpolationDelayMs) >= epsilonMs
        const intervalElapsed = now - this.lastInterpolationDelayReportAt >= minIntervalMs
        if (!options.force && (!changed || !intervalElapsed)) {
            return false
        }

        this.lastReportedInterpolationDelayMs = roundedDelayMs
        this.lastInterpolationDelayReportAt = now
        // A delayed flush needs only the latest reported delay.
        const queued = this.outbound.outboundEngineCommands.get(this.outbound.tick)
        if (queued) {
            const previous = queued.find(command => command.ntype === EngineMessage.InterpolationDelay)
            if (previous) { previous.delayMs = roundedDelayMs; return true }
        }
        this.addEngineCommand({
            ntype: EngineMessage.InterpolationDelay,
            delayMs: roundedDelayMs
        })
        return true
    }

    /** @internal */
    predictCommand(command: any, options: PredictionOperationOptions = {}) {
        const tick = this.commandFrameNumber
        this.addCommand(command)
        return this.client.predictor.addCommand?.(command, tick, options)
    }

    /** @internal */
    predictCommandWithTiming(command: any, predictionOptions: PredictionOperationOptions = {}, timingOptions: CommandTimingOptions = {}) {
        const tick = this.commandFrameNumber
        this.addCommandWithTiming(command, timingOptions)
        return this.client.predictor.addCommand?.(command, tick, predictionOptions)
    }

    /** @internal */
    predictState(payload: any, options: PredictionOperationOptions = {}) {
        return this.client.predictor.addState?.(payload, this.commandFrameNumber, options)
    }

    /** @internal */
    flush() {
        if (this.pendingOutboundRollback && this.predictionWarningAfterMs !== null && !this.predictionWarningReported) {
            // Only a successful application send makes this batch eligible for a warning.
            this.lastSentCommandFrameNumber = this.pendingOutboundRollback.commandFrameNumber
            this.lastSentAtMs = this.nowMs()
        }
        this.pendingOutboundRollback = null
        this.outbound.flush()
    }

    private checkPredictionConfirmation(receivedAtMs: number, confirmedCommandFrameNumber: number) {
        if (this.predictionWarningAfterMs === null || this.predictionWarningReported || this.lastSentCommandFrameNumber === 0) return
        if (confirmedCommandFrameNumber >= this.lastSentCommandFrameNumber || this.client.predictor.log.operations.size === 0) {
            this.watchedPredictionFrameNumber = 0
            return
        }

        let pendingFrameNumber = 0
        // Inspect the existing log without allocating a second history or pending array.
        for (const operation of this.client.predictor.log.operations.values()) {
            if (operation.status === PredictionOperationStatus.Pending &&
                operation.kind !== PredictionOperationKind.Request &&
                operation.commandFrameNumber <= this.lastSentCommandFrameNumber) {
                pendingFrameNumber = operation.commandFrameNumber
                break
            }
        }

        if (pendingFrameNumber !== this.watchedPredictionFrameNumber) {
            this.watchedPredictionFrameNumber = pendingFrameNumber
            // Older queued snapshots must not age a prediction that was just sent.
            this.watchedPredictionSinceMs = Math.max(receivedAtMs, this.lastSentAtMs)
            return
        }
        if (pendingFrameNumber === 0 || receivedAtMs - this.watchedPredictionSinceMs < this.predictionWarningAfterMs) return

        this.predictionWarningReported = true
        console.warn(
            `nengi prediction: command frame ${pendingFrameNumber} remains unconfirmed while snapshots arrive ` +
            `(last confirmed: ${confirmedCommandFrameNumber}). Check that the server calls user.confirmCommandsThrough(...) ` +
            'after handling all input through that batch and before instance.step(). ' +
            'For intentionally deferred simulation, adjust ClientOptions.predictionWarningAfterMs or set it to null. ' +
            'This warning does not confirm or discard predictions.'
        )
    }

    private recordServerClockSample(serverTimeMs: number, clientReceiveTimeMs: number, roundTripMs: number) {
        const oneWayMs = roundTripMs > 0 ? roundTripMs * 0.5 : 0
        const sampleOffsetMs = serverTimeMs - clientReceiveTimeMs + oneWayMs
        if (!Number.isFinite(sampleOffsetMs)) {
            return
        }
        if (this.serverTimeSyncSamples === 0) {
            this.serverTimeOffsetMs = sampleOffsetMs
        } else {
            this.serverTimeOffsetMs = (this.serverTimeOffsetMs * 0.85) + (sampleOffsetMs * 0.15)
        }
        this.serverTimeSyncSamples++
    }

    /** @internal */
    request<Request = any, Response = any>(
        endpoint: Endpoint<Request, Response>,
        payload: Request,
        options: RequestOptions<Response> = {}
    ): Promise<Response> {
        if (typeof options !== 'object' || options === null || 'callback' in options) {
            throw new TypeError('Client.request accepts an options object and returns a Promise. Use await or then/catch instead of a callback.')
        }
        if (this.sessionEnded) throw new ClientConnectionError('INVALID_STATE', 'This session has ended.')
        const endpointDefinition = getEndpointDefinition(endpoint)
        const endpointId = getEndpointId(endpoint)
        const policy = options.policy ?? RequestPolicy.Allow
        if (options.key !== undefined && policy === RequestPolicy.Dedupe) {
            const existing = this.getPendingRequestByKey<Response>(options.key)
            if (existing) {
                return existing.promise
            }
        }
        // Prepare the new payload before cancelling any older queued intent.
        const encodedPayload = createEndpointPayload(payload, endpointDefinition?.requestSchema)
        if (this.sessionEnded) throw new ClientConnectionError('INVALID_STATE', 'This session has ended.')
        if (options.key !== undefined && policy === RequestPolicy.ReplaceQueued) {
            const queued = this.requestQueue.arr.filter(request => request.key === options.key)
            for (const existing of queued) {
                // Prediction reconciliation can flush or disconnect synchronously.
                if (!this.requestQueue.arr.includes(existing)) continue
                this.rejectRequest(existing, new RequestError('Request replaced.', 'REPLACED', {
                    requestId: existing.requestId,
                    endpointId: existing.endpointId
                }))
            }
        }
        // Rejecting a replaced prediction can synchronously end the session.
        if (this.sessionEnded) throw new ClientConnectionError('INVALID_STATE', 'This session has ended.')
        const requestId = this.nextRequestId()
        let resolveRequest!: (response: Response) => void
        let rejectRequest!: (reason: any) => void
        const promise = new Promise<Response>((resolve, reject) => {
            resolveRequest = resolve
            rejectRequest = reject
        })

        const obj: ClientRequest<Response> = {
            endpoint: endpointDefinition,
            endpointId,
            requestId,
            payload: encodedPayload,
            resolve: resolveRequest,
            reject: rejectRequest,
            timeout: null,
            key: options.key,
            promise
        }

        // Payload getters/toJSON are application code as well.
        if (this.sessionEnded) throw new ClientConnectionError('INVALID_STATE', 'This session has ended.')

        const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs
        if (timeoutMs > 0) {
            obj.timeout = setTimeout(() => {
                this.rejectRequest(obj, new RequestError('Request timed out.', 'TIMEOUT', {
                    requestId,
                    endpointId
                }))
            }, timeoutMs)
        }

        this.requestQueue.enqueue(obj)
        this.requests.set(obj.requestId, obj)
        if (options.prediction) {
            this.client.predictor.addRequest?.(obj.requestId, obj.endpointId, payload, this.commandFrameNumber, options.prediction)
        }
        return promise
    }

    /** @internal */
    nextRequestId(): number {
        if (this.requests.size >= MAX_UINT32) {
            throw new Error('No request ids are available.')
        }

        if (!isValidUInt32(this.requestId) || this.requestId === 0) {
            this.requestId = 1
        }

        while (this.requests.has(this.requestId)) {
            this.requestId++
            if (this.requestId > MAX_UINT32) {
                this.requestId = 1
            }
        }

        const id = this.requestId
        this.requestId++
        if (this.requestId > MAX_UINT32) {
            this.requestId = 1
        }
        return id
    }

    /** @internal */
    getPendingRequestByKey<Response = any>(key: string): ClientRequest<Response> | undefined {
        for (const request of this.requests.values()) {
            if (request.key === key) return request as ClientRequest<Response>
        }
    }

    /** @internal */
    rejectRequest(request: ClientRequest, reason: any) {
        if (this.requests.get(request.requestId) !== request) return
        if (request.timeout) {
            clearTimeout(request.timeout)
            request.timeout = null
        }
        this.requests.delete(request.requestId)
        const queuedIndex = this.requestQueue.arr.indexOf(request)
        if (queuedIndex > -1) {
            this.requestQueue.arr.splice(queuedIndex, 1)
        }
        if (this.requestQueue.length === 0) {
            this.requestBacklogActive = false
        }
        request.reject(reason)
        this.client.predictor.rejectRequest?.(request.requestId, reason, this.latestFrame || undefined, this.store)
    }

    /** @internal */
    resolveRequest(request: ClientRequest, response: any) {
        if (this.requests.get(request.requestId) !== request) return
        if (request.timeout) {
            clearTimeout(request.timeout)
            request.timeout = null
        }
        this.requests.delete(request.requestId)
        request.resolve(response)
        this.client.predictor.resolveRequest?.(request.requestId, response, this.latestFrame || undefined, this.store)
    }

    /** @internal */
    rejectPendingRequests(reason: any) {
        Array.from(this.requests.values()).forEach(request => {
            this.rejectRequest(request, reason)
        })
    }

    drainFrames(maxFrames = Number.POSITIVE_INFINITY): Frame[] {
        const frames: Frame[] = []
        while (frames.length < maxFrames) {
            const frame = this.processNextFrame()
            if (!frame) {
                break
            }
            frames.push(frame)
        }
        return frames
    }

    processNextFrame(): Frame | null {
        if (this.sessionEnded) return null
        const pending = this.pendingFrames.shift()
        if (!pending) {
            return null
        }

        const frame = this.store.applySnapshot(pending.snapshot, this.frameTick, pending.receivedAtMs)
        frame.channels.forEach(channel => {
            channel.deleteEntities.forEach(nid => this.pendingTypeDeletes.add(nid))
            channel.ecsDeleteEntities.forEach(pid => this.pendingTypeDeletes.add(pid))
        })
        frame.closedChannels.forEach(closed => {
            this.pendingTypeDeletes.add(closed.channelId)
            closed.entityNids.forEach(nid => this.pendingTypeDeletes.add(nid))
        })
        // The decoder may already know types from newer queued snapshots. Only
        // remove closed/deleted IDs once the store catches up, and keep any ID
        // now owned by a replacement entity or schema-backed channel header.
        if (this.pendingFrames.length === 0 && this.pendingTypeDeletes.size > 0) {
            this.pendingTypeDeletes.forEach(nid => {
                const header = this.store.channelHeaders.get(nid)
                if (!this.store.entities.has(nid) && (!header || !hasSchemaBackedChannelHeader(header))) {
                    this.entityNTypes.delete(nid)
                }
            })
            this.pendingTypeDeletes.clear()
        }
        this.frameTick++
        this.frameHistory.push(frame)
        while (this.frames.length > this.maxFrameHistory) {
            this.frameHistory.shift()
        }
        if (this.store.historyEnabled && this.frames.length > 0) {
            this.store.history.pruneBefore(this.frames[0].tick)
        }
        this.latestFrame = frame

        this.client.predictor.resolveFrame?.(frame, this.store)
        if (this.sessionEnded) return frame
        this.client.predictor.cleanUp(frame.confirmedCommandFrameNumber)
        this.checkPredictionConfirmation(pending.receivedAtMs, frame.confirmedCommandFrameNumber)

        pending.pendingResponses.forEach(pendingResponse => {
            if (pendingResponse.status === ResponseStatus.Ok) {
                this.resolveRequest(pendingResponse.request, pendingResponse.response)
            } else {
                this.rejectRequest(pendingResponse.request, pendingResponse.error)
            }
        })

        return frame
    }

    getPendingFrameCount() {
        return this.pendingFrames.length
    }

    /** @internal */
    queueSnapshot(snapshot: Snapshot, receivedAtMs = this.nowMs()) {
        if (this.sessionEnded) return
        this.pendingFrames.push({
            snapshot,
            receivedAtMs,
            pendingResponses: []
        })
    }

    getEstimatedServerTimeMs(nowMs = this.nowMs()) {
        if (this.serverTimeSyncSamples === 0) {
            return null
        }
        return nowMs + this.serverTimeOffsetMs
    }

    getClockSync() {
        return {
            serverTimeOffsetMs: this.serverTimeOffsetMs,
            roundTripMs: this.roundTripMs,
            samples: this.serverTimeSyncSamples
        }
    }

    /** @internal */
    getRequestsForNextFrame(): ClientRequest[] {
        const start = Math.max(0, this.requestQueue.arr.length - MAX_REQUESTS_PER_FRAME)
        return this.requestQueue.arr.slice(start).reverse()
    }

    /** @internal */
    markRequestsSent(requests: ClientRequest[]) {
        requests.forEach(request => {
            const index = this.requestQueue.arr.indexOf(request)
            if (index > -1) {
                this.requestQueue.arr.splice(index, 1)
            }
        })
    }

    /** @internal */
    reportRequestBacklog(info: RequestBacklogInfo) {
        if (info.remaining === 0) {
            this.requestBacklogActive = false
            return
        }
        if (!this.requestBacklogActive) {
            this.requestBacklogActive = true
            this.onRequestBacklog(info)
        }
    }

    /** @internal */
    createHandshake<InboundPayload extends BinaryPayload, OutboundPayload extends BinaryPayload>(handshake: any = {}, binary: BinaryAdapter<InboundPayload, OutboundPayload>): OutboundPayload {
        const handshakeMessage = {
            ntype: EngineMessage.ConnectionAttempt,
            wireProtocolVersion: WIRE_PROTOCOL_VERSION,
            handshake: JSON.stringify(handshake),
            schemaFingerprint: this.sendSchemaFingerprint ? createSchemaFingerprint(this.client.context) : ''
        }

        const handshakeByteLength = count(connectionAttemptSchema, handshakeMessage)
        const dw = binary.createWriter(handshakeByteLength + 2)
        dw.writeUInt8(BinarySection.EngineMessages)
        dw.writeUInt8(1)
        writeMessage(handshakeMessage, connectionAttemptSchema, dw)
        assertBinaryWriteSize(dw, handshakeByteLength + 2, 'Connection attempt')
        return dw.payload
    }

    /** @internal */
    readHandshakeResponse(reader: IBinaryReader): HandshakeResponse {
        try {
            const section = reader.readUInt8()
            if (section !== BinarySection.EngineMessages) {
                return {
                    accepted: false,
                    reason: new Error('Connection response did not contain engine messages.')
                }
            }

            let accepted = false
            let clientData: unknown
            let protocol = this.protocol
            const count = reader.readUInt8()
            for (let i = 0; i < count; i++) {
                const engineMessage: any = readEngineMessage(reader, this.client.context)
                if (engineMessage.ntype === EngineMessage.ConnectionAccepted) {
                    if (accepted) throw new Error('Duplicate connection acceptance.')
                    if (engineMessage.wireProtocolVersion !== WIRE_PROTOCOL_VERSION) {
                        return {
                            accepted: false,
                            reason: new Error(
                                `Nengi wire protocol mismatch. Client ${WIRE_PROTOCOL_VERSION}, ` +
                                `server ${engineMessage.wireProtocolVersion}.`
                            )
                        }
                    }
                    clientData = engineMessage.clientData === '' ? undefined : JSON.parse(engineMessage.clientData)
                    accepted = true
                    continue
                }
                if (engineMessage.ntype === EngineMessage.Protocol) {
                    assertNetworkIdType(engineMessage.nidType)
                    assertNetworkIdType(engineMessage.ntypeType)
                    protocol = { nidType: engineMessage.nidType, ntypeType: engineMessage.ntypeType }
                    continue
                }
                if (engineMessage.ntype === EngineMessage.ConnectionDenied) {
                    return {
                        accepted: false,
                        denied: true,
                        reason: JSON.parse(reader.readString())
                    }
                }
            }

            if (reader.offset !== reader.byteLength) throw new Error('Unexpected data after the connection response.')
            if (accepted) {
                this.protocol = protocol
                return { accepted: true, clientData }
            }

            return {
                accepted: false,
                reason: new Error('Connection response did not include an accepted or denied message.')
            }
        } catch (err) {
            return {
                accepted: false,
                reason: err
            }
        }
    }

    /** @internal */
    setProtocol(nidType: number, ntypeType: number) {
        assertNetworkIdType(nidType)
        assertNetworkIdType(ntypeType)
        this.protocol = { nidType, ntypeType }
    }

    /** @internal */
    createOutbound<InboundPayload extends BinaryPayload, OutboundPayload extends BinaryPayload>(binary: BinaryAdapter<InboundPayload, OutboundPayload>): OutboundPayload {
        this.pendingOutboundRollback = this.createOutboundRollback()
        const commandFrameNumber = this.commandFrameNumber
        this.addEngineCommand({ ntype: EngineMessage.CommandFrameNumber, commandFrameNumber })
        const timedCommands = this.outbound.getCommandTiming(this.outbound.tick)
        for (let i = 0; i < timedCommands.length; i++) {
            const timing = timedCommands[i]
            this.addEngineCommand({
                ntype: EngineMessage.CommandTiming,
                commandIndex: timing.commandIndex,
                clientTimeMs: timing.clientTimeMs,
                renderDelayMs: timing.renderDelayMs,
                viewTick: timing.viewTick,
                viewServerTimeMs: timing.viewServerTimeMs
            })
        }

        const pendingPongs = this.pendingPongs.splice(0)
        for (let i = 0; i < pendingPongs.length; i++) {
            const pong = pendingPongs[i]
            this.addEngineCommand({
                ntype: EngineMessage.Pong,
                pingId: pong.pingId,
                clientReceiveTimeMs: pong.clientReceiveTimeMs,
                clientSendTimeMs: this.nowMs()
            })
        }

        let bytes = 0

        const isDebug = false
        const debug: any = {}

        const { outboundEngineCommands, outboundCommands } = this.outbound.getCurrentFrame()
        const queuedRequests = this.requestQueue.length
        const requests = this.getRequestsForNextFrame()
        // Reserve the selected batch before calling binary/application code.
        // It cannot be replaced while being encoded; rollback restores eligibility.
        if (requests.length > 0) this.markRequestsSent(requests)

        if (outboundEngineCommands.length > MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET) {
            throw new Error('Too many client engine messages in one packet; flush more frequently.')
        }
        if (outboundCommands.length > 255) {
            throw new Error('A client packet supports at most 255 commands; flush more frequently.')
        }

        // count ENGINE COMMANDS
        if (outboundEngineCommands.length > 0) {
            bytes += 2 * Math.ceil(outboundEngineCommands.length / MAX_ENGINE_MESSAGES_PER_SECTION)
            outboundEngineCommands.forEach((command: any) => {
                bytes += count(this.client.context.getEngineSchema(command.ntype)!, command)
            })
        }

        // count COMMANDS
        if (outboundCommands.length > 0) {
            bytes += 1 // commands!
            bytes += 1 // number of commands
            outboundCommands.forEach((command: any) => {
                bytes += count(this.client.context.getSchema(command.ntype)!, command, this.protocol.ntypeType)
            })
        }

        // count REQUESTS
        if (requests.length > 0) {
            bytes += 1 // requests
            bytes += 1 // number of requests
            requests.forEach((request: any) => {
                bytes += 12 + countEndpointPayload(request.payload)
            })
        }

        const dw = binary.createWriter(bytes)

        // Each section has a UInt8 count; timing metadata can require more than one.
        for (let offset = 0; offset < outboundEngineCommands.length; offset += MAX_ENGINE_MESSAGES_PER_SECTION) {
            const end = Math.min(offset + MAX_ENGINE_MESSAGES_PER_SECTION, outboundEngineCommands.length)
            dw.writeUInt8(BinarySection.EngineMessages)
            dw.writeUInt8(end - offset)
            for (let i = offset; i < end; i++) {
                const command = outboundEngineCommands[i]
                writeMessage(command, this.client.context.getEngineSchema(command.ntype)!, dw)
            }
        }

        if (isDebug) {
            debug.engineCommands = []
            outboundEngineCommands.forEach((command: any) => {
                debug.engineCommands.push(command)
            })
        }

        // write COMMANDS
        if (outboundCommands.length > 0) {
            dw.writeUInt8(BinarySection.Commands)
            dw.writeUInt8(outboundCommands.length)

            outboundCommands.forEach((command: any) => {
                writeMessage(command, this.client.context.getSchema(command.ntype)!, dw, this.protocol.ntypeType)
            })
        }

        if (isDebug) {
            debug.commands = []
            outboundCommands.forEach((command: any) => {
                debug.commands.push(command)
            })
        }


        // write REQUESTS
        if (requests.length > 0) {
            dw.writeUInt8(BinarySection.Requests)
            dw.writeUInt8(requests.length)
            requests.forEach((request: any) => {
                dw.writeUInt32(request.requestId)
                dw.writeUInt32(request.endpointId)
                dw.writeUInt32(countEndpointPayload(request.payload))
                writeEndpointPayload(request.payload, dw)
            })
        }

        assertBinaryWriteSize(dw, bytes, 'Client outbound')
        this.reportRequestBacklog({
            queued: queuedRequests,
            sent: requests.length,
            remaining: this.requestQueue.length,
            frame: commandFrameNumber
        })

        if (isDebug) {
            debug.commandFrameNumber = commandFrameNumber
            console.log({ debug })
        }


        if (!this.sessionEnded) {
            this.incrementCommandFrameNumber()
            this.outbound.tick = this.commandFrameNumber
        }
        return dw.payload
    }

    /**
     * Sends only queued Pong engine messages. The queue is committed after the
     * adapter send succeeds, so a transport error leaves the Pongs available to
     * the next control or application flush.
     */
    /** @internal */
    flushPongs<InboundPayload extends BinaryPayload, OutboundPayload extends BinaryPayload>(
        binary: BinaryAdapter<InboundPayload, OutboundPayload>,
        send: (payload: OutboundPayload) => void
    ) {
        let sent = 0
        while (this.pendingPongs.length > 0) {
            const pendingPongs = this.pendingPongs.slice(0, MAX_ENGINE_MESSAGES_PER_SECTION)
            const commands = pendingPongs.map(pong => ({
                ntype: EngineMessage.Pong,
                pingId: pong.pingId,
                clientReceiveTimeMs: pong.clientReceiveTimeMs,
                clientSendTimeMs: this.nowMs()
            }))
            let bytes = 2
            for (let i = 0; i < commands.length; i++) {
                bytes += count(
                    this.client.context.getEngineSchema(commands[i].ntype)!,
                    commands[i]
                )
            }

            const dw = binary.createWriter(bytes)
            dw.writeUInt8(BinarySection.EngineMessages)
            dw.writeUInt8(commands.length)
            for (let i = 0; i < commands.length; i++) {
                writeMessage(
                    commands[i],
                    this.client.context.getEngineSchema(commands[i].ntype)!,
                    dw
                )
            }

            assertBinaryWriteSize(dw, bytes, 'Pongs')
            send(dw.payload)
            this.pendingPongs.splice(0, pendingPongs.length)
            sent += pendingPongs.length
        }
        return sent
    }

    /** @internal */
    createOutboundRollback(): OutboundRollback {
        return {
            commandFrameNumber: this.commandFrameNumber,
            outboundTick: this.outbound.tick,
            outboundEngineCommands: cloneCommandMap(this.outbound.outboundEngineCommands),
            outboundCommands: cloneCommandMap(this.outbound.outboundCommands),
            outboundCommandTiming: cloneCommandMap(this.outbound.outboundCommandTiming),
            requestQueue: this.requestQueue.arr.slice(),
            requestBacklogActive: this.requestBacklogActive,
            pendingPongs: this.pendingPongs.slice()
        }
    }

    /** @internal */
    rollbackOutbound() {
        const rollback = this.pendingOutboundRollback
        if (!rollback) {
            return false
        }

        this.commandFrameNumber = rollback.commandFrameNumber
        this.outbound.tick = rollback.outboundTick
        this.outbound.outboundEngineCommands = cloneCommandMap(rollback.outboundEngineCommands)
        this.outbound.outboundCommands = cloneCommandMap(rollback.outboundCommands)
        this.outbound.outboundCommandTiming = cloneCommandMap(rollback.outboundCommandTiming)
        const originalRequests = new Set(rollback.requestQueue)
        const stillPending = (request: ClientRequest) => this.requests.get(request.requestId) === request
        // Keep newly queued intent and omit requests rejected during encoding.
        this.requestQueue.arr = this.requestQueue.arr.filter(request => !originalRequests.has(request) && stillPending(request))
            .concat(rollback.requestQueue.filter(stillPending))
        this.requestBacklogActive = rollback.requestBacklogActive
        this.pendingPongs = rollback.pendingPongs.slice()
        this.pendingOutboundRollback = null
        return true
    }

    /** Decode only. Client owns liveness, automatic Pongs and fatal failures. */
    /** @internal */
    readSnapshot(dr: IBinaryReader) {
        if (this.sessionEnded) return
        const receivedAtMs = this.nowMs()
        const serverTimeMs = readSnapshotHeader(dr)
        if (!Number.isFinite(serverTimeMs)) {
            throw new Error('Snapshot serverTimeMs must be finite.')
        }
        const snapshot: Snapshot = {
            serverTimeMs,
            confirmedCommandFrameNumber: -1,
            messages: [],
            interpolatedMessages: [],
            channels: [],
            channelOpens: [],
            channelHeaderUpdates: [],
            channelCloses: [],
            skipInterpolationNids: [],
            ecsCreateEntities: [],
            ecsCreateComponents: [],
            ecsDeleteEntities: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }
        const pendingResponses: PendingResponse[] = []
        let currentChannelId = 0
        const channelSnapshots = new Map<number, SnapshotChannel>()
        const getCurrentChannel = () => {
            let channel = channelSnapshots.get(currentChannelId)
            if (!channel) {
                channel = {
                    channelId: currentChannelId,
                    messages: [],
                    interpolatedMessages: [],
                    ecsCreateEntities: [],
                    ecsCreateComponents: [],
                    ecsDeleteEntities: [],
                    createEntities: [],
                    updateEntities: [],
                    updateEntityGroups: [],
                    deleteEntities: []
                }
                channelSnapshots.set(currentChannelId, channel)
                snapshot.channels!.push(channel)
            }
            return channel
        }
        const target = () => currentChannelId === 0 ? snapshot : getCurrentChannel()

        while (dr.offset < dr.byteLength) {
            const section = dr.readUInt8()
            switch (section) {
            case BinarySection.ChannelScope: {
                currentChannelId = readNetworkId(this.protocol.nidType, dr)
                break
            }
            case BinarySection.EngineMessages: {
                const count = dr.readUInt8()
                for (let i = 0; i < count; i++) {
                    const engineMessage: any = readEngineMessage(dr, this.client.context)
                    if (engineMessage.ntype === EngineMessage.ConnectionTerminated) {
                        throw new ClientConnectionError('REMOTE_CLOSE', 'The server ended the session.', { detail: engineMessage.reason })
                    }
                    if (engineMessage.ntype === EngineMessage.CommandFrameNumber) {
                        snapshot.confirmedCommandFrameNumber = engineMessage.commandFrameNumber
                    }

                    if (engineMessage.ntype === EngineMessage.Protocol) {
                        this.setProtocol(engineMessage.nidType, engineMessage.ntypeType)
                    }

                    if (engineMessage.ntype === EngineMessage.Ping) {
                        // Timestamp entry to the receive callback, not the point
                        // at which decoding reaches this engine section. Parsing
                        // belongs to client turnaround in the Pong exchange.
                        const clientReceiveTimeMs = receivedAtMs
                        this.pendingPongs.push({
                            pingId: engineMessage.pingId,
                            clientReceiveTimeMs
                        })
                        this.roundTripMs = engineMessage.latency
                        this.latency = this.roundTripMs
                        this.recordServerClockSample(engineMessage.serverTimeMs, clientReceiveTimeMs, engineMessage.latency)
                    }
                }
                break
            }
            case BinarySection.Messages: {
                const count = dr.readUInt32()
                const output = target().messages
                for (let i = 0; i < count; i++) {
                    const message = readMessage(dr, this.client.context, this.protocol.ntypeType)
                    output.push(message)
                }
                break
            }
            case BinarySection.InterpolatedMessages: {
                const count = dr.readUInt32()
                const output = target().interpolatedMessages!
                for (let i = 0; i < count; i++) {
                    const message = readMessage(dr, this.client.context, this.protocol.ntypeType)
                    output.push(message)
                }
                break
            }
            case BinarySection.Responses: {
                const count = dr.readUInt8()
                for (let i = 0; i < count; i++) {
                    const requestId = dr.readUInt32()
                    const status = dr.readUInt8()
                    const payloadByteLength = dr.readUInt32()
                    const request = this.requests.get(requestId)
                    if (!request) {
                        skipEndpointPayload(dr, payloadByteLength)
                    } else if (status === ResponseStatus.Ok) {
                        const response = readSizedEndpointPayload(dr, payloadByteLength, request.endpoint?.responseSchema)
                        pendingResponses.push({ request, status: ResponseStatus.Ok, response })
                    } else if (status === ResponseStatus.Error) {
                        const payload = readSizedEndpointPayload(dr, payloadByteLength)
                        pendingResponses.push({ request, status: ResponseStatus.Error, error: new RequestError(payload.message || 'Request failed.', payload.code || 'SERVER_ERROR', {
                            requestId,
                            endpointId: request.endpointId,
                            payload
                        }) })
                    } else {
                        skipEndpointPayload(dr, payloadByteLength)
                        pendingResponses.push({ request, status: ResponseStatus.Error, error: new RequestError('Request failed with an unknown response status.', 'UNKNOWN_STATUS', {
                            requestId,
                            endpointId: request.endpointId,
                            payload: { status }
                        }) })
                    }
                }
                break
            }
            case BinarySection.ChannelOpens: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    const channelId = readNetworkId(this.protocol.nidType, dr)
                    const channelType = dr.readUInt8() as ChannelType
                    const name = dr.readString()
                    let header = createChannelHeader(channelId, channelType, undefined, name || undefined)
                    if (dr.readUInt8() === 1) {
                        const headerData = readEntity(dr, this.client.context, this.protocol.ntypeType, this.protocol.nidType) as IEntity
                        this.entityNTypes.set(headerData.nid, headerData.ntype)
                        header = mergeChannelHeaderData(header, headerData)
                    }
                    snapshot.channelOpens!.push({
                        channelId,
                        header
                    })
                }
                break
            }
            case BinarySection.ChannelHeaderUpdates: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    const channelId = readNetworkId(this.protocol.nidType, dr)
                    const propCount = dr.readUInt32()
                    const changes: any[] = []
                    for (let j = 0; j < propCount; j++) {
                        changes.push(readDiff(dr, this.client.context, this.entityNTypes, this.protocol.nidType))
                    }
                    const groupCount = dr.readUInt32()
                    for (let j = 0; j < groupCount; j++) {
                        readUpdateGroup(dr, this.client.context, this.entityNTypes, this.protocol.nidType, changes)
                    }
                    snapshot.channelHeaderUpdates!.push({
                        channelId,
                        changes,
                        groups: []
                    })
                }
                break
            }
            case BinarySection.ChannelCloses: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    snapshot.channelCloses!.push({
                        channelId: readNetworkId(this.protocol.nidType, dr)
                    })
                }
                break
            }
            case BinarySection.SkipInterpolation: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    snapshot.skipInterpolationNids!.push(readNetworkId(this.protocol.nidType, dr))
                }
                break
            }
            case BinarySection.CreateEntities: {
                const count = dr.readUInt32()
                const output = target().createEntities
                for (let i = 0; i < count; i++) {
                    const entity = readEntity(dr, this.client.context, this.protocol.ntypeType, this.protocol.nidType) as IEntity
                    this.entityNTypes.set(entity.nid, entity.ntype)
                    output.push(entity)
                }
                break
            }
            case BinarySection.EcsCreateEntities: {
                const count = dr.readUInt32()
                const output = target().ecsCreateEntities!
                for (let i = 0; i < count; i++) {
                    output.push(readNetworkId(this.protocol.nidType, dr))
                }
                break
            }
            case BinarySection.EcsCreateComponents: {
                const count = dr.readUInt32()
                const output = target().ecsCreateComponents!
                for (let i = 0; i < count; i++) {
                    const pid = readNetworkId(this.protocol.nidType, dr)
                    const component = readEntity(dr, this.client.context, this.protocol.ntypeType, this.protocol.nidType) as IEntity
                    ;(component as any).pid = pid
                    this.entityNTypes.set(component.nid, component.ntype)
                    output.push(component)
                }
                break
            }
            case BinarySection.UpdateEntities: {
                const count = dr.readUInt32()
                const output = target().updateEntities
                for (let i = 0; i < count; i++) {
                    const diff = readDiff(dr, this.client.context, this.entityNTypes, this.protocol.nidType)
                    output.push(diff)
                }
                break
            }
            case BinarySection.UpdateEntityGroups: {
                const count = dr.readUInt32()
                const output = target().updateEntities
                for (let i = 0; i < count; i++) {
                    readUpdateGroup(dr, this.client.context, this.entityNTypes, this.protocol.nidType, output)
                }
                break
            }
            case BinarySection.EcsUpdateComponentGroups: {
                const output = target().updateEntities
                const ntype = readNetworkId(this.protocol.ntypeType, dr)
                const groupKey = dr.readUInt8()
                const count = dr.readUInt32()
                const schema = this.client.context.getSchema(ntype)!
                const group = schema.updateGroups[groupKey]
                for (let i = 0; i < count; i++) {
                    const nid = readNetworkId(this.protocol.nidType, dr)
                    for (let j = 0; j < group.props.length; j++) {
                        const prop = group.props[j]
                        output.push({
                            nid,
                            prop: prop.prop,
                            value: prop.binary.post(prop.binary.read(dr))
                        })
                    }
                }
                break
            }
            case BinarySection.DeleteEntities: {
                const count = dr.readUInt32()
                const output = target().deleteEntities
                for (let i = 0; i < count; i++) {
                    const nid = readNetworkId(this.protocol.nidType, dr)
                    this.entityNTypes.delete(nid)
                    output.push(nid)
                }
                break
            }
            case BinarySection.EcsDeleteEntities: {
                const count = dr.readUInt32()
                const output = target().ecsDeleteEntities!
                for (let i = 0; i < count; i++) {
                    output.push(readNetworkId(this.protocol.nidType, dr))
                }
                break
            }
            default: {
                throw new Error(`Unknown snapshot binary section ${section}.`)
            }
            }
        }

        this.pendingFrames.push({ snapshot, receivedAtMs, pendingResponses })
    }
}

function cloneCommandMap<T>(map: Map<number, T[]>) {
    const clone = new Map<number, T[]>()
    map.forEach((value, key) => {
        clone.set(key, value.slice())
    })
    return clone
}
