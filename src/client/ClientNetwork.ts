import { IEntity } from '../common/IEntity'
import { NQueue } from '../NQueue'
import { Client } from './Client'
import { Snapshot } from './Snapshot'
import { writeMessage } from '../binary/message/writeMessage'
import { connectionAttemptSchema } from '../common/schemas/connectAttemptSchema'
import readMessage from '../binary/message/readMessage'
import readDiff from '../binary/entity/readDiff'
import { IBinaryWriter, IBinaryWriterClass } from '../common/binary/IBinaryWriter'
import { IBinaryReader } from '../common/binary/IBinaryReader'
import { BinaryAdapter, BinaryPayload } from '../common/binary/BinaryAdapter'
import { DEFAULT_PROTOCOL, ProtocolConfig, assertNetworkIdType, readNetworkId } from '../common/binary/Protocol'
import { EngineMessage } from '../common/EngineMessage'
import { BinarySection } from '../common/binary/BinarySection'
import count from '../binary/message/count'
import readEngineMessage from '../binary/message/readEngineMessage'
import { Chronus } from './Chronus'
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

const MAX_REQUESTS_PER_FRAME = 255

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
    callback?: (response: Response) => any
}

type HandshakeResponse = {
    accepted: boolean
    reason?: any
}

type PendingResponse =
    | { request: ClientRequest, status: ResponseStatus.Ok, response: any }
    | { request: ClientRequest, status: ResponseStatus.Error, error: RequestError }

export class ClientNetwork {
    client: Client
    store: EntityStore
    entityNTypes: Map<number, number>
    frames: Frame[] = []
    rawFrames: Frame[] = []
    latestFrame: Frame | null = null
    messages: any[] = []
    predictionErrorFrames: any[] = []
    outbound = new Outbound()
    requestId = 1
    requestQueue = new NQueue<ClientRequest>()
    requests = new Map<number, ClientRequest>()
    requestTimeoutMs = 10000
    requestBacklogActive = false
    protocol: ProtocolConfig = { ...DEFAULT_PROTOCOL }
    clientTick = 1 // incremented each flush to the server
    previousSnapshot: Snapshot | null = null
    chronus = new Chronus()
    frameTick = 1 // incremented each frame that comes from server
    latency = 0

    onDisconnect: (reason: any, event?: any) => void = (reason: any, event?: any) => {
        this.rejectPendingRequests(new RequestError('Disconnected before request completed.', 'DISCONNECTED', {
            payload: reason
        }))
        this.client.disconnectHandler(reason, event)
    }
    onSocketError: (event: any) => void = (event: any) => {
        this.client.websocketErrorHandler(event)
    }
    onRequestBacklog: (info: RequestBacklogInfo) => void = (info: RequestBacklogInfo) => {
        console.warn(
            `nengi request backlog: ${info.remaining} requests remain queued after sending ${info.sent} of ${info.queued} for client frame ${info.frame}.`
        )
    }

    constructor(client: Client) {
        this.client = client
        this.store = new EntityStore(client.context)
        this.entityNTypes = this.store.ntypes
    }

    incrementClientTick() {
        this.clientTick++
        if (this.clientTick > 65535) {
            this.clientTick = 1
        }
    }

    addEngineCommand(command: any) {
        this.outbound.addEngineCommand(command)
    }

    addCommand(command: any) {
        this.outbound.addCommand(command)
    }

    flush() {
        this.outbound.flush()
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
        request.reject(reason)
    }

    resolveRequest(request: ClientRequest, response: any) {
        if (request.timeout) {
            clearTimeout(request.timeout)
            request.timeout = null
        }
        this.requests.delete(request.requestId)
        request.resolve(response)
        request.callback(response)
    }

    rejectPendingRequests(reason: any) {
        Array.from(this.requests.values()).forEach(request => {
            this.rejectRequest(request, reason)
        })
    }

    drainFrames(): Frame[] {
        const frames = this.rawFrames
        this.rawFrames = []
        return frames
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

    createHandshake<InboundPayload extends BinaryPayload, OutboundPayload extends BinaryPayload>(handshake: any, binary: BinaryAdapter<InboundPayload, OutboundPayload>): OutboundPayload {
        const handshakeMessage = {
            ntype: EngineMessage.ConnectionAttempt,
            handshake: JSON.stringify(handshake)
        }

        const handshakeByteLength = count(connectionAttemptSchema, handshakeMessage)
        const dw = binary.createWriter(handshakeByteLength + 2)
        dw.writeUInt8(BinarySection.EngineMessages)
        dw.writeUInt8(1)
        writeMessage(handshakeMessage, connectionAttemptSchema, dw)
        return dw.payload
    }

    createHandshakeBuffer<Payload extends BinaryPayload>(handshake: any, binaryWriterCtor: IBinaryWriterClass<Payload>): Payload {
        return this.createHandshake(handshake, {
            createWriter: (byteLength: number) => binaryWriterCtor.create(byteLength),
            createReader: () => {
                throw new Error('createHandshakeBuffer compatibility binary adapter cannot create readers.')
            }
        })
    }

    readHandshakeResponse(reader: IBinaryReader): HandshakeResponse {
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
    }

    setProtocol(nidType: number, ntypeType: number) {
        assertNetworkIdType(nidType)
        assertNetworkIdType(ntypeType)
        this.protocol = { nidType, ntypeType }
    }

    createOutbound<InboundPayload extends BinaryPayload, OutboundPayload extends BinaryPayload>(binary: BinaryAdapter<InboundPayload, OutboundPayload>): OutboundPayload {
        const tick = this.clientTick
        this.addEngineCommand({ ntype: EngineMessage.ClientTick, tick })

        let bytes = 0

        const isDebug = false
        const debug: any = {}

        const { outboundEngineCommands, outboundCommands } = this.outbound.getCurrentFrame()
        const queuedRequests = this.requestQueue.length
        const requests = this.getRequestsForNextFrame()

        // count ENGINE COMMANDS
        if (outboundEngineCommands.length > 0) {
            bytes += 1 // commands!
            bytes += 1 // number of commands
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

        // write ENGINE COMMANDs
        if (outboundEngineCommands.length > 0) {
            dw.writeUInt8(BinarySection.EngineMessages)
            dw.writeUInt8(outboundEngineCommands.length)

            outboundEngineCommands.forEach((command: any) => {
                writeMessage(command, this.client.context.getEngineSchema(command.ntype)!, dw)
            })
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
            frame: tick
        })

        if (isDebug) {
            debug.tick = tick
            console.log({ debug })
        }


        this.outbound.tick = tick
        this.incrementClientTick()
        return dw.payload
    }

    createOutboundBuffer<Payload extends BinaryPayload>(binaryWriterCtor: IBinaryWriterClass<Payload>): Payload {
        return this.createOutbound({
            createWriter: (byteLength: number) => binaryWriterCtor.create(byteLength),
            createReader: () => {
                throw new Error('createOutboundBuffer compatibility binary adapter cannot create readers.')
            }
        })
    }

    readSnapshot(dr: IBinaryReader) {
        const snapshot: Snapshot = {
            timestamp: -1,
            confirmedClientTick: -1,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }
        const pendingResponses: PendingResponse[] = []

        while (dr.offset < dr.byteLength) {
            const section = dr.readUInt8()
            switch (section) {
            case BinarySection.EngineMessages: {
                const count = dr.readUInt8()
                for (let i = 0; i < count; i++) {
                    const engineMessage = readEngineMessage(dr, this.client.context)
                    if (engineMessage.ntype === EngineMessage.ConnectionTerminated) {
                        // @ts-ignore
                        this.onDisconnect(engineMessage.reason)
                    }
                    if (engineMessage.ntype === EngineMessage.TimeSync) {
                        // @ts-ignore
                        snapshot.timestamp = engineMessage.timestamp
                    }
                    if (engineMessage.ntype === EngineMessage.ClientTick) {
                        // @ts-ignore
                        snapshot.confirmedClientTick = engineMessage.tick
                    }

                    if (engineMessage.ntype === EngineMessage.Protocol) {
                        // @ts-ignore
                        this.setProtocol(engineMessage.nidType, engineMessage.ntypeType)
                    }

                    if (engineMessage.ntype === EngineMessage.Ping) {
                        this.addEngineCommand({ ntype: EngineMessage.Pong })
                        // @ts-ignore
                        this.latency = engineMessage.latency
                    }
                }
                break
            }
            case BinarySection.Messages: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    const message = readMessage(dr, this.client.context, this.protocol.ntypeType)
                    snapshot.messages.push(message)
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
            case BinarySection.CreateEntities: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    const entity = readEntity(dr, this.client.context, this.protocol.ntypeType, this.protocol.nidType) as IEntity
                    this.store.ntypes.set(entity.nid, entity.ntype)
                    snapshot.createEntities.push(entity)
                }
                break
            }
            case BinarySection.UpdateEntities: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    const diff = readDiff(dr, this.client.context, this.entityNTypes, this.protocol.nidType)
                    snapshot.updateEntities.push(diff)
                }
                break
            }
            case BinarySection.DeleteEntities: {
                const count = dr.readUInt32()
                for (let i = 0; i < count; i++) {
                    const nid = readNetworkId(this.protocol.nidType, dr)
                    snapshot.deleteEntities.push(nid)
                }
                break
            }
            default: {
                console.log('hit unknown section while readding binary')
                break
            }
            }
        }

        // client engine level state

        // timing
        if (snapshot.timestamp !== -1) {
            this.client.network.chronus.register(snapshot.timestamp)
        } else {
            if (this.previousSnapshot) {
                snapshot.timestamp = this.previousSnapshot.timestamp + (1000 / this.client.serverTickRate)
            }
        }

        // apply authoritative state once, then expose compact frame events
        const frame = this.store.applySnapshot(snapshot, this.frameTick)
        this.frameTick++
        this.frames.push(frame)
        this.rawFrames.push(frame)
        this.latestFrame = frame
        snapshot.messages.forEach(message => this.messages.push(message))

        const predictionErrorFrame = this.client.predictor.getErrors(frame, this.store.entities)
        if (predictionErrorFrame.entities.size > 0) {
            this.client.network.predictionErrorFrames.push(predictionErrorFrame)
        }

        this.client.predictor.cleanUp(frame.confirmedClientTick)
        // commands/prediction
        this.outbound.confirmCommands(snapshot.confirmedClientTick)
        this.previousSnapshot = snapshot

        pendingResponses.forEach(pending => {
            if (pending.status === ResponseStatus.Ok) {
                this.resolveRequest(pending.request, pending.response)
            } else {
                this.rejectRequest(pending.request, pending.error)
            }
        })
    }
}
