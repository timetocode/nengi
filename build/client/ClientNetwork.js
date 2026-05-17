"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientNetwork = void 0;
const NQueue_1 = require("../NQueue");
const writeMessage_1 = require("../binary/message/writeMessage");
const connectAttemptSchema_1 = require("../common/schemas/connectAttemptSchema");
const readMessage_1 = __importDefault(require("../binary/message/readMessage"));
const readDiff_1 = __importDefault(require("../binary/entity/readDiff"));
const Protocol_1 = require("../common/binary/Protocol");
const EngineMessage_1 = require("../common/EngineMessage");
const BinarySection_1 = require("../common/binary/BinarySection");
const count_1 = __importDefault(require("../binary/message/count"));
const readEngineMessage_1 = __importDefault(require("../binary/message/readEngineMessage"));
const Chronus_1 = require("./Chronus");
const Outbound_1 = require("./Outbound");
const EntityStore_1 = require("./EntityStore");
const readEntity_1 = __importDefault(require("../binary/entity/readEntity"));
const EndpointPayload_1 = require("../binary/endpoint/EndpointPayload");
const Endpoint_1 = require("../common/Endpoint");
const MAX_REQUESTS_PER_FRAME = 255;
class ClientNetwork {
    constructor(client) {
        this.frames = [];
        this.rawFrames = [];
        this.latestFrame = null;
        this.messages = [];
        this.predictionErrorFrames = [];
        this.outbound = new Outbound_1.Outbound();
        this.requestId = 1;
        this.requestQueue = new NQueue_1.NQueue();
        this.requests = new Map();
        this.requestTimeoutMs = 10000;
        this.requestBacklogActive = false;
        this.protocol = Object.assign({}, Protocol_1.DEFAULT_PROTOCOL);
        this.clientTick = 1; // incremented each flush to the server
        this.previousSnapshot = null;
        this.chronus = new Chronus_1.Chronus();
        this.frameTick = 1; // incremented each frame that comes from server
        this.latency = 0;
        this.onDisconnect = (reason, event) => {
            this.rejectPendingRequests(new Endpoint_1.RequestError('Disconnected before request completed.', 'DISCONNECTED', {
                payload: reason
            }));
            this.client.disconnectHandler(reason, event);
        };
        this.onSocketError = (event) => {
            this.client.websocketErrorHandler(event);
        };
        this.onRequestBacklog = (info) => {
            console.warn(`nengi request backlog: ${info.remaining} requests remain queued after sending ${info.sent} of ${info.queued} for client frame ${info.frame}.`);
        };
        this.client = client;
        this.store = new EntityStore_1.EntityStore(client.context);
        this.entityNTypes = this.store.ntypes;
    }
    incrementClientTick() {
        this.clientTick++;
        if (this.clientTick > 65535) {
            this.clientTick = 1;
        }
    }
    addEngineCommand(command) {
        this.outbound.addEngineCommand(command);
    }
    addCommand(command) {
        this.outbound.addCommand(command);
    }
    flush() {
        this.outbound.flush();
    }
    request(endpoint, payload, callbackOrOptions) {
        var _a, _b;
        const options = typeof callbackOrOptions === 'function' ? { callback: callbackOrOptions } : (callbackOrOptions || {});
        const endpointDefinition = (0, Endpoint_1.getEndpointDefinition)(endpoint);
        const endpointId = (0, Endpoint_1.getEndpointId)(endpoint);
        const policy = (_a = options.policy) !== null && _a !== void 0 ? _a : Endpoint_1.RequestPolicy.Allow;
        if (options.key && policy === Endpoint_1.RequestPolicy.Dedupe) {
            const existing = this.getPendingRequestByKey(options.key);
            if (existing) {
                return existing.promise;
            }
        }
        if (options.key && policy === Endpoint_1.RequestPolicy.Replace) {
            const existing = this.getPendingRequestByKey(options.key);
            if (existing) {
                this.rejectRequest(existing, new Endpoint_1.RequestError('Request replaced.', 'REPLACED', {
                    requestId: existing.requestId,
                    endpointId: existing.endpointId
                }));
            }
        }
        const requestId = this.nextRequestId();
        let resolveRequest;
        let rejectRequest;
        const promise = new Promise((resolve, reject) => {
            resolveRequest = resolve;
            rejectRequest = reject;
        });
        const obj = {
            endpoint: endpointDefinition,
            endpointId,
            requestId,
            payload: (0, EndpointPayload_1.createEndpointPayload)(payload, endpointDefinition === null || endpointDefinition === void 0 ? void 0 : endpointDefinition.requestSchema),
            callback: (response) => {
                if (options.callback) {
                    options.callback(response);
                }
            },
            resolve: resolveRequest,
            reject: rejectRequest,
            timeout: null,
            key: options.key,
            promise
        };
        const timeoutMs = (_b = options.timeoutMs) !== null && _b !== void 0 ? _b : this.requestTimeoutMs;
        if (timeoutMs > 0) {
            obj.timeout = setTimeout(() => {
                this.rejectRequest(obj, new Endpoint_1.RequestError('Request timed out.', 'TIMEOUT', {
                    requestId,
                    endpointId
                }));
            }, timeoutMs);
        }
        this.requestQueue.enqueue(obj);
        this.requests.set(obj.requestId, obj);
        return promise;
    }
    nextRequestId() {
        if (this.requests.size >= Endpoint_1.MAX_UINT32) {
            throw new Error('No request ids are available.');
        }
        if (!(0, Endpoint_1.isValidUInt32)(this.requestId) || this.requestId === 0) {
            this.requestId = 1;
        }
        while (this.requests.has(this.requestId)) {
            this.requestId++;
            if (this.requestId > Endpoint_1.MAX_UINT32) {
                this.requestId = 1;
            }
        }
        const id = this.requestId;
        this.requestId++;
        if (this.requestId > Endpoint_1.MAX_UINT32) {
            this.requestId = 1;
        }
        return id;
    }
    getPendingRequestByKey(key) {
        return Array.from(this.requests.values()).find(request => request.key === key);
    }
    rejectRequest(request, reason) {
        if (request.timeout) {
            clearTimeout(request.timeout);
            request.timeout = null;
        }
        this.requests.delete(request.requestId);
        const queuedIndex = this.requestQueue.arr.indexOf(request);
        if (queuedIndex > -1) {
            this.requestQueue.arr.splice(queuedIndex, 1);
        }
        if (this.requestQueue.length === 0) {
            this.requestBacklogActive = false;
        }
        request.reject(reason);
    }
    resolveRequest(request, response) {
        if (request.timeout) {
            clearTimeout(request.timeout);
            request.timeout = null;
        }
        this.requests.delete(request.requestId);
        request.resolve(response);
        request.callback(response);
    }
    rejectPendingRequests(reason) {
        Array.from(this.requests.values()).forEach(request => {
            this.rejectRequest(request, reason);
        });
    }
    drainFrames() {
        const frames = this.rawFrames;
        this.rawFrames = [];
        return frames;
    }
    getRequestsForNextFrame() {
        const start = Math.max(0, this.requestQueue.arr.length - MAX_REQUESTS_PER_FRAME);
        return this.requestQueue.arr.slice(start).reverse();
    }
    markRequestsSent(requests) {
        requests.forEach(request => {
            const index = this.requestQueue.arr.indexOf(request);
            if (index > -1) {
                this.requestQueue.arr.splice(index, 1);
            }
        });
    }
    reportRequestBacklog(info) {
        if (info.remaining === 0) {
            this.requestBacklogActive = false;
            return;
        }
        if (!this.requestBacklogActive) {
            this.requestBacklogActive = true;
            this.onRequestBacklog(info);
        }
    }
    createHandshake(handshake, binary) {
        const handshakeMessage = {
            ntype: EngineMessage_1.EngineMessage.ConnectionAttempt,
            handshake: JSON.stringify(handshake)
        };
        const handshakeByteLength = (0, count_1.default)(connectAttemptSchema_1.connectionAttemptSchema, handshakeMessage);
        const dw = binary.createWriter(handshakeByteLength + 2);
        dw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
        dw.writeUInt8(1);
        (0, writeMessage_1.writeMessage)(handshakeMessage, connectAttemptSchema_1.connectionAttemptSchema, dw);
        return dw.payload;
    }
    createHandshakeBuffer(handshake, binaryWriterCtor) {
        return this.createHandshake(handshake, {
            createWriter: (byteLength) => binaryWriterCtor.create(byteLength),
            createReader: () => {
                throw new Error('createHandshakeBuffer compatibility binary adapter cannot create readers.');
            }
        });
    }
    readHandshakeResponse(reader) {
        const section = reader.readUInt8();
        if (section !== BinarySection_1.BinarySection.EngineMessages) {
            return {
                accepted: false,
                reason: new Error('Connection response did not contain engine messages.')
            };
        }
        let accepted = false;
        const count = reader.readUInt8();
        for (let i = 0; i < count; i++) {
            const engineMessage = (0, readEngineMessage_1.default)(reader, this.client.context);
            if (engineMessage.ntype === EngineMessage_1.EngineMessage.ConnectionAccepted) {
                accepted = true;
                continue;
            }
            if (engineMessage.ntype === EngineMessage_1.EngineMessage.Protocol) {
                this.setProtocol(engineMessage.nidType, engineMessage.ntypeType);
                continue;
            }
            if (engineMessage.ntype === EngineMessage_1.EngineMessage.ConnectionDenied) {
                return {
                    accepted: false,
                    reason: JSON.parse(reader.readString())
                };
            }
        }
        if (accepted) {
            return { accepted: true };
        }
        return {
            accepted: false,
            reason: new Error('Connection response did not include an accepted or denied message.')
        };
    }
    setProtocol(nidType, ntypeType) {
        (0, Protocol_1.assertNetworkIdType)(nidType);
        (0, Protocol_1.assertNetworkIdType)(ntypeType);
        this.protocol = { nidType, ntypeType };
    }
    createOutbound(binary) {
        const tick = this.clientTick;
        this.addEngineCommand({ ntype: EngineMessage_1.EngineMessage.ClientTick, tick });
        let bytes = 0;
        const isDebug = false;
        const debug = {};
        const { outboundEngineCommands, outboundCommands } = this.outbound.getCurrentFrame();
        const queuedRequests = this.requestQueue.length;
        const requests = this.getRequestsForNextFrame();
        // count ENGINE COMMANDS
        if (outboundEngineCommands.length > 0) {
            bytes += 1; // commands!
            bytes += 1; // number of commands
            outboundEngineCommands.forEach((command) => {
                bytes += (0, count_1.default)(this.client.context.getEngineSchema(command.ntype), command);
            });
        }
        // count COMMANDS
        if (outboundCommands.length > 0) {
            bytes += 1; // commands!
            bytes += 1; // number of commands
            outboundCommands.forEach((command) => {
                bytes += (0, count_1.default)(this.client.context.getSchema(command.ntype), command, this.protocol.ntypeType);
            });
        }
        // count REQUESTS
        if (requests.length > 0) {
            bytes += 1; // requests
            bytes += 1; // number of requests
            requests.forEach((request) => {
                bytes += 12 + (0, EndpointPayload_1.countEndpointPayload)(request.payload);
            });
        }
        const dw = binary.createWriter(bytes);
        // write ENGINE COMMANDs
        if (outboundEngineCommands.length > 0) {
            dw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
            dw.writeUInt8(outboundEngineCommands.length);
            outboundEngineCommands.forEach((command) => {
                (0, writeMessage_1.writeMessage)(command, this.client.context.getEngineSchema(command.ntype), dw);
            });
        }
        if (isDebug) {
            debug.engineCommands = [];
            outboundEngineCommands.forEach((command) => {
                debug.engineCommands.push(command);
            });
        }
        // write COMMANDS
        if (outboundCommands.length > 0) {
            dw.writeUInt8(BinarySection_1.BinarySection.Commands);
            dw.writeUInt8(outboundCommands.length);
            outboundCommands.forEach((command) => {
                (0, writeMessage_1.writeMessage)(command, this.client.context.getSchema(command.ntype), dw, this.protocol.ntypeType);
            });
        }
        if (isDebug) {
            debug.commands = [];
            outboundCommands.forEach((command) => {
                debug.commands.push(command);
            });
        }
        // write REQUESTS
        if (requests.length > 0) {
            dw.writeUInt8(BinarySection_1.BinarySection.Requests);
            dw.writeUInt8(requests.length);
            requests.forEach((request) => {
                dw.writeUInt32(request.requestId);
                dw.writeUInt32(request.endpointId);
                dw.writeUInt32((0, EndpointPayload_1.countEndpointPayload)(request.payload));
                (0, EndpointPayload_1.writeEndpointPayload)(request.payload, dw);
            });
            this.markRequestsSent(requests);
        }
        this.reportRequestBacklog({
            queued: queuedRequests,
            sent: requests.length,
            remaining: this.requestQueue.length,
            frame: tick
        });
        if (isDebug) {
            debug.tick = tick;
            console.log({ debug });
        }
        this.outbound.tick = tick;
        this.incrementClientTick();
        return dw.payload;
    }
    createOutboundBuffer(binaryWriterCtor) {
        return this.createOutbound({
            createWriter: (byteLength) => binaryWriterCtor.create(byteLength),
            createReader: () => {
                throw new Error('createOutboundBuffer compatibility binary adapter cannot create readers.');
            }
        });
    }
    readSnapshot(dr) {
        var _a;
        const snapshot = {
            timestamp: -1,
            confirmedClientTick: -1,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        };
        const pendingResponses = [];
        while (dr.offset < dr.byteLength) {
            const section = dr.readUInt8();
            switch (section) {
                case BinarySection_1.BinarySection.EngineMessages: {
                    const count = dr.readUInt8();
                    for (let i = 0; i < count; i++) {
                        const engineMessage = (0, readEngineMessage_1.default)(dr, this.client.context);
                        if (engineMessage.ntype === EngineMessage_1.EngineMessage.ConnectionTerminated) {
                            // @ts-ignore
                            this.onDisconnect(engineMessage.reason);
                        }
                        if (engineMessage.ntype === EngineMessage_1.EngineMessage.TimeSync) {
                            // @ts-ignore
                            snapshot.timestamp = engineMessage.timestamp;
                        }
                        if (engineMessage.ntype === EngineMessage_1.EngineMessage.ClientTick) {
                            // @ts-ignore
                            snapshot.confirmedClientTick = engineMessage.tick;
                        }
                        if (engineMessage.ntype === EngineMessage_1.EngineMessage.Protocol) {
                            // @ts-ignore
                            this.setProtocol(engineMessage.nidType, engineMessage.ntypeType);
                        }
                        if (engineMessage.ntype === EngineMessage_1.EngineMessage.Ping) {
                            this.addEngineCommand({ ntype: EngineMessage_1.EngineMessage.Pong });
                            // @ts-ignore
                            this.latency = engineMessage.latency;
                        }
                    }
                    break;
                }
                case BinarySection_1.BinarySection.Messages: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const message = (0, readMessage_1.default)(dr, this.client.context, this.protocol.ntypeType);
                        snapshot.messages.push(message);
                    }
                    break;
                }
                case BinarySection_1.BinarySection.Responses: {
                    const count = dr.readUInt8();
                    for (let i = 0; i < count; i++) {
                        const requestId = dr.readUInt32();
                        const status = dr.readUInt8();
                        const payloadByteLength = dr.readUInt32();
                        const request = this.requests.get(requestId);
                        if (!request) {
                            (0, EndpointPayload_1.skipEndpointPayload)(dr, payloadByteLength);
                        }
                        else if (status === Endpoint_1.ResponseStatus.Ok) {
                            const response = (0, EndpointPayload_1.readSizedEndpointPayload)(dr, payloadByteLength, (_a = request.endpoint) === null || _a === void 0 ? void 0 : _a.responseSchema);
                            pendingResponses.push({ request, status: Endpoint_1.ResponseStatus.Ok, response });
                        }
                        else if (status === Endpoint_1.ResponseStatus.Error) {
                            const payload = (0, EndpointPayload_1.readSizedEndpointPayload)(dr, payloadByteLength);
                            pendingResponses.push({ request, status: Endpoint_1.ResponseStatus.Error, error: new Endpoint_1.RequestError(payload.message || 'Request failed.', payload.code || 'SERVER_ERROR', {
                                    requestId,
                                    endpointId: request.endpointId,
                                    payload
                                }) });
                        }
                        else {
                            (0, EndpointPayload_1.skipEndpointPayload)(dr, payloadByteLength);
                            pendingResponses.push({ request, status: Endpoint_1.ResponseStatus.Error, error: new Endpoint_1.RequestError('Request failed with an unknown response status.', 'UNKNOWN_STATUS', {
                                    requestId,
                                    endpointId: request.endpointId,
                                    payload: { status }
                                }) });
                        }
                    }
                    break;
                }
                case BinarySection_1.BinarySection.CreateEntities: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const entity = (0, readEntity_1.default)(dr, this.client.context, this.protocol.ntypeType, this.protocol.nidType);
                        this.store.ntypes.set(entity.nid, entity.ntype);
                        snapshot.createEntities.push(entity);
                    }
                    break;
                }
                case BinarySection_1.BinarySection.UpdateEntities: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const diff = (0, readDiff_1.default)(dr, this.client.context, this.entityNTypes, this.protocol.nidType);
                        snapshot.updateEntities.push(diff);
                    }
                    break;
                }
                case BinarySection_1.BinarySection.DeleteEntities: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const nid = (0, Protocol_1.readNetworkId)(this.protocol.nidType, dr);
                        snapshot.deleteEntities.push(nid);
                    }
                    break;
                }
                default: {
                    console.log('hit unknown section while readding binary');
                    break;
                }
            }
        }
        // client engine level state
        // timing
        if (snapshot.timestamp !== -1) {
            this.client.network.chronus.register(snapshot.timestamp);
        }
        else {
            if (this.previousSnapshot) {
                snapshot.timestamp = this.previousSnapshot.timestamp + (1000 / this.client.serverTickRate);
            }
        }
        // apply authoritative state once, then expose compact frame events
        const frame = this.store.applySnapshot(snapshot, this.frameTick);
        this.frameTick++;
        this.frames.push(frame);
        this.rawFrames.push(frame);
        this.latestFrame = frame;
        snapshot.messages.forEach(message => this.messages.push(message));
        const predictionErrorFrame = this.client.predictor.getErrors(frame, this.store.entities);
        if (predictionErrorFrame.entities.size > 0) {
            this.client.network.predictionErrorFrames.push(predictionErrorFrame);
        }
        this.client.predictor.cleanUp(frame.confirmedClientTick);
        // commands/prediction
        this.outbound.confirmCommands(snapshot.confirmedClientTick);
        this.previousSnapshot = snapshot;
        pendingResponses.forEach(pending => {
            if (pending.status === Endpoint_1.ResponseStatus.Ok) {
                this.resolveRequest(pending.request, pending.response);
            }
            else {
                this.rejectRequest(pending.request, pending.error);
            }
        });
    }
}
exports.ClientNetwork = ClientNetwork;
