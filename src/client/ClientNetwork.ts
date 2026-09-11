import { IEntity } from '../common/IEntity'
import { ChannelType, createChannelHeader, hasSchemaBackedChannelHeader, mergeChannelHeaderData } from '../common/ChannelHeader'
import { SnapshotChannel } from '../binary/snapshot/SnapshotPlan'
import { NQueue } from '../NQueue'
import { Client } from './Client'
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
    callback: (response: Response) => any
    resolve: (response: Response) => void
    reject: (reason: any) => void
    timeout: ReturnType<typeof setTimeout> | null
    key?: string
    promise: Promise<Response>
}

type RequestOptions<Response = any> = {
    timeoutMs?: number,
    key?: string,
    policy?: RequestPolicy,
    callback?: (response: Response) => any,
    prediction?: PredictionOperationOptions<Response>
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
    accepted: boolean
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
    client: Client
    store: EntityStore
    entityNTypes: Map<number, number>
    frames: Frame[] = []
    pendingFrames: PendingServerFrame[] = []
    latestFrame: Frame | null = null
    outbound = new Outbound()
    requestId = 1
    requestQueue = new NQueue<ClientRequest>()
    requests = new Map<number, ClientRequest>()
    requestTimeoutMs = 10000
    requestBacklogActive = false
    protocol: ProtocolConfig = { ...DEFAULT_PROTOCOL }
    commandFrameNumber = 1 // monotonic public command-frame number
    frameTick = 1 // incremented each frame that comes from server
    maxFrameHistory = 240
    latency = 0
    roundTripMs = 0
    serverTimeOffsetMs = 0
    serverTimeSyncSamples = 0
    interpolationDelayMs = 0
    interpolationDelayReportIntervalMs = 500
    interpolationDelayReportEpsilonMs = 1
    private lastReportedInterpolationDelayMs = Number.NaN
    private lastInterpolationDelayReportAt = Number.NEGATIVE_INFINITY
    sendSchemaFingerprint = false
    private pendingOutboundRollback: OutboundRollback | null = null
    private pendingPongs: PendingPong[] = []
    private pendingTypeDeletes = new Set<number>()

    onDisconnect: (reason: any, event?: any) => void = (reason: any, event?: any) => {
        this.pendingPongs = []
        this.serverTimeOffsetMs = 0
        this.serverTimeSyncSamples = 0
        this.roundTripMs = 0
        this.latency = 0
        this.rejectPendingRequests(new RequestError('Disconnected before request completed.', 'DISCONNECTED', {
            payload: reason
        }))
        this.client.disconnectHandler(reason, event)
    }
    onMalformedSnapshot: (error: unknown) => void = (error: unknown) => {
        this.onSocketError(error)
    }
    onSocketError: (event: any) => void = (event: any) => {
        this.client.websocketErrorHandler(event)
    }
    onRequestBacklog: (info: RequestBacklogInfo) => void = (info: RequestBacklogInfo) => {
        console.warn(
            `nengi request backlog: ${info.remaining} requests remain queued after sending ${info.sent} of ${info.queued} for command frame ${info.frame}.`
        )
    }

    constructor(client: Client) {
        this.client = client
        this.store = new EntityStore(client.context)
        this.entityNTypes = new Map()
        this.outbound.tick = this.commandFrameNumber
    }

    private nowMs() {
        return this.client.now ? this.client.now() : getLocalTime()
    }

    incrementCommandFrameNumber() {
        this.commandFrameNumber++
    }

    addEngineCommand(command: any) {
        this.outbound.addEngineCommand(command)
    }

    addCommand(command: any) {
        this.outbound.addCommand(command)
    }

    addCommandWithTiming(command: any, options: CommandTimingOptions = {}) {
        this.outbound.addCommandWithTiming(command, {
            clientTimeMs: options.inputTimeMs ?? this.nowMs(),
            renderDelayMs: options.renderDelayMs ?? 0,
            viewTick: options.viewTick ?? -1,
            viewServerTimeMs: options.viewServerTimeMs ?? -1
        })
    }

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

    predictCommand(command: any, options: PredictionOperationOptions = {}) {
        const tick = this.commandFrameNumber
        this.addCommand(command)
        return this.client.predictor.addCommand?.(command, tick, options)
    }

    predictCommandWithTiming(command: any, predictionOptions: PredictionOperationOptions = {}, timingOptions: CommandTimingOptions = {}) {
        const tick = this.commandFrameNumber
        this.addCommandWithTiming(command, timingOptions)
        return this.client.predictor.addCommand?.(command, tick, predictionOptions)
    }

    predictState(payload: any, options: PredictionOperationOptions = {}) {
        return this.client.predictor.addState?.(payload, this.commandFrameNumber, options)
    }

    flush() {
        this.pendingOutboundRollback = null
        this.outbound.flush()
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

    request<Request = any, Response = any>(
        endpoint: Endpoint<Request, Response>,
        payload: Request,
        callbackOrOptions?: ((response: Response) => any) | RequestOptions<Response>
    ): Promise<Response> {
        const options = typeof callbackOrOptions === 'function' ? { callback: callbackOrOptions } : (callbackOrOptions || {})
        const endpointDefinition = getEndpointDefinition(endpoint)
        const endpointId = getEndpointId(endpoint)
        const policy = options.policy ?? RequestPolicy.Allow
        if (options.key && policy === RequestPolicy.Dedupe) {
            const existing = this.getPendingRequestByKey<Response>(options.key)
            if (existing) {
                return existing.promise
            }
        }
        if (options.key && policy === RequestPolicy.Replace) {
            const existing = this.getPendingRequestByKey(options.key)
            if (existing) {
                this.rejectRequest(existing, new RequestError('Request replaced.', 'REPLACED', {
                    requestId: existing.requestId,
                    endpointId: existing.endpointId
                }))
            }
        }
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
            payload: createEndpointPayload(payload, endpointDefinition?.requestSchema),
            callback: (response: Response) => {
                if (options.callback) {
                    options.callback(response)
                }
            },
            resolve: resolveRequest,
            reject: rejectRequest,
            timeout: null,
            key: options.key,
            promise
        }

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

    getPendingRequestByKey<Response = any>(key: string): ClientRequest<Response> | undefined {
        return Array.from(this.requests.values()).find(request => request.key === key) as ClientRequest<Response> | undefined
    }

    rejectRequest(request: ClientRequest, reason: any) {
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
        this.client.predictor.rejectRequest?.(request.requestId, reason, this.latestFrame || undefined, this.store)
        request.reject(reason)
    }

    resolveRequest(request: ClientRequest, response: any) {
        if (request.timeout) {
            clearTimeout(request.timeout)
            request.timeout = null
        }
        this.requests.delete(request.requestId)
        this.client.predictor.resolveRequest?.(request.requestId, response, this.latestFrame || undefined, this.store)
        request.resolve(response)
        request.callback(response)
    }

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
        this.frames.push(frame)
        while (this.frames.length > this.maxFrameHistory) {
            this.frames.shift()
        }
        if (this.frames.length > 0) {
            this.store.history.pruneBefore(this.frames[0].tick)
        }
        this.latestFrame = frame

        this.client.predictor.resolveFrame?.(frame, this.store)
        this.client.predictor.cleanUp(frame.confirmedCommandFrameNumber)
        this.outbound.confirmCommands(pending.snapshot.confirmedCommandFrameNumber)

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

    queueSnapshot(snapshot: Snapshot, receivedAtMs = this.nowMs()) {
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

    getRequestsForNextFrame(): ClientRequest[] {
        const start = Math.max(0, this.requestQueue.arr.length - MAX_REQUESTS_PER_FRAME)
        return this.requestQueue.arr.slice(start).reverse()
    }

    markRequestsSent(requests: ClientRequest[]) {
        requests.forEach(request => {
            const index = this.requestQueue.arr.indexOf(request)
            if (index > -1) {
                this.requestQueue.arr.splice(index, 1)
            }
        })
    }

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
        return dw.payload
    }

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
            const count = reader.readUInt8()
            for (let i = 0; i < count; i++) {
                const engineMessage: any = readEngineMessage(reader, this.client.context)
                if (engineMessage.ntype === EngineMessage.ConnectionAccepted) {
                    if (engineMessage.wireProtocolVersion !== WIRE_PROTOCOL_VERSION) {
                        return {
                            accepted: false,
                            reason: new Error(
                                `Nengi wire protocol mismatch. Client ${WIRE_PROTOCOL_VERSION}, ` +
                                `server ${engineMessage.wireProtocolVersion}.`
                            )
                        }
                    }
                    accepted = true
                    continue
                }
                if (engineMessage.ntype === EngineMessage.Protocol) {
                    this.setProtocol(engineMessage.nidType, engineMessage.ntypeType)
                    continue
                }
                if (engineMessage.ntype === EngineMessage.ConnectionDenied) {
                    return {
                        accepted: false,
                        reason: JSON.parse(reader.readString())
                    }
                }
            }

            if (accepted) {
                return { accepted: true }
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

    setProtocol(nidType: number, ntypeType: number) {
        assertNetworkIdType(nidType)
        assertNetworkIdType(ntypeType)
        this.protocol = { nidType, ntypeType }
    }

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
            this.markRequestsSent(requests)
        }

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


        this.incrementCommandFrameNumber()
        this.outbound.tick = this.commandFrameNumber
        return dw.payload
    }

    /**
     * Sends only queued Pong engine messages. The queue is committed after the
     * adapter send succeeds, so a transport error leaves the Pongs available to
     * the next control or application flush.
     */
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

            send(dw.payload)
            this.pendingPongs.splice(0, pendingPongs.length)
            sent += pendingPongs.length
        }
        return sent
    }

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
        this.requestQueue.arr = rollback.requestQueue.slice()
        this.requestBacklogActive = rollback.requestBacklogActive
        this.pendingPongs = rollback.pendingPongs.slice()
        this.pendingOutboundRollback = null
        return true
    }

    readSnapshot(dr: IBinaryReader) {
        const pendingPongCount = this.pendingPongs.length
        try {
            this.readSnapshotUnsafe(dr)
            if (this.pendingPongs.length > pendingPongCount) {
                try {
                    this.client.adapter?.flushPongs?.()
                } catch (error) {
                    this.onSocketError(error)
                }
            }
        } catch (err) {
            try {
                this.onMalformedSnapshot(err)
            } catch (observerError) {
                // Diagnostics must not prevent the fatal transport cleanup.
            }
            try {
                this.client.disconnect({ reason: 'malformed_snapshot' })
            } catch (disconnectError) {
                // The transport may already be closed or otherwise unusable.
            }
        }
    }

    readSnapshotUnsafe(dr: IBinaryReader) {
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
                        this.onDisconnect(engineMessage.reason)
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
                    const changes = []
                    for (let j = 0; j < propCount; j++) {
                        changes.push(readDiff(dr, this.client.context, this.entityNTypes, this.protocol.nidType))
                    }
                    const groupCount = dr.readUInt32()
                    for (let j = 0; j < groupCount; j++) {
                        const diffs = readUpdateGroup(dr, this.client.context, this.entityNTypes, this.protocol.nidType)
                        for (let k = 0; k < diffs.length; k++) {
                            changes.push(diffs[k])
                        }
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
                    const diffs = readUpdateGroup(dr, this.client.context, this.entityNTypes, this.protocol.nidType)
                    for (let j = 0; j < diffs.length; j++) {
                        output.push(diffs[j])
                    }
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
