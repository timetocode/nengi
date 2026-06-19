"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstanceNetwork = void 0;
const NetworkEvent_1 = require("../common/binary/NetworkEvent");
const User_1 = require("./User");
const BinarySection_1 = require("../common/binary/BinarySection");
const EngineMessage_1 = require("../common/EngineMessage");
const readEngineMessage_1 = __importDefault(require("../binary/message/readEngineMessage"));
const readMessage_1 = __importDefault(require("../binary/message/readMessage"));
const count_1 = __importDefault(require("../binary/message/count"));
const writeMessage_1 = require("../binary/message/writeMessage");
const BinaryExt_1 = require("../common/binary/BinaryExt");
const Binary_1 = require("../common/binary/Binary");
const EndpointPayload_1 = require("../binary/endpoint/EndpointPayload");
const Endpoint_1 = require("../common/Endpoint");
const schemaFingerprint_1 = require("../common/binary/schema/schemaFingerprint");
const NQueue_1 = require("../NQueue");
function createSnapshotPerformanceWindow() {
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
    };
}
function countStringBytes(value) {
    return (0, BinaryExt_1.binaryGet)(Binary_1.Binary.String).byteSize(value);
}
function errorPayload(code, message) {
    return { code, message };
}
function serializeConnectionError(err) {
    if (err instanceof Error) {
        return JSON.stringify({
            name: err.name,
            message: err.message
        });
    }
    return JSON.stringify(err);
}
class InstanceNetwork {
    constructor(instance) {
        this.responseBacklogUsers = new Set();
        this.requestQueue = new NQueue_1.NQueue();
        this.requireSchemaFingerprint = false;
        this.debugBinaryWrites = false;
        this.sharedUpdateFragmentsEnabled = false;
        this.sharedUpdateFragments = new Map();
        this.sharedCreateFragments = new Map();
        this.sharedDeleteFragments = new Map();
        this.sharedMessageFragments = new Map();
        /**
         * Disabled by default because each sample takes several high-resolution
         * clock reads per user. The fields intentionally mirror the snapshot
         * pipeline so stress tests can tell whether time is going to visibility
         * and plan collection, exact byte counting, binary writing, commit work,
         * or the adapter send call.
         */
        this.snapshotPerformanceEnabled = false;
        this.snapshotPerformance = createSnapshotPerformanceWindow();
        this.onResponseBacklog = (info) => {
            console.warn(`nengi response backlog: ${info.remaining} responses remain queued for user ${info.user.id} after sending ${info.sent} of ${info.queued} on server tick ${info.tick}.`);
        };
        this.instance = instance;
    }
    onRequest() {
        // TODO
    }
    recordSnapshotPerformance(sample) {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        const metrics = this.snapshotPerformance;
        metrics.snapshots++;
        metrics.collectTotalMs += sample.collectMs;
        metrics.collectMaxMs = Math.max(metrics.collectMaxMs, sample.collectMs);
        metrics.countTotalMs += sample.countMs;
        metrics.countMaxMs = Math.max(metrics.countMaxMs, sample.countMs);
        metrics.writeTotalMs += sample.writeMs;
        metrics.writeMaxMs = Math.max(metrics.writeMaxMs, sample.writeMs);
        metrics.commitTotalMs += sample.commitMs;
        metrics.commitMaxMs = Math.max(metrics.commitMaxMs, sample.commitMs);
        metrics.sendTotalMs += sample.sendMs;
        metrics.sendMaxMs = Math.max(metrics.sendMaxMs, sample.sendMs);
        metrics.bytesTotal += sample.bytes;
        metrics.bytesMax = Math.max(metrics.bytesMax, sample.bytes);
        metrics.createsTotal += sample.creates;
        metrics.updatePropsTotal += sample.updateProps;
        metrics.updateGroupsTotal += sample.updateGroups;
        metrics.groupedUpdatePropsTotal += sample.groupedUpdateProps;
        metrics.deletesTotal += sample.deletes;
        metrics.messagesTotal += sample.messages;
        metrics.messagesMax = Math.max(metrics.messagesMax, sample.messages);
        metrics.engineMessagesTotal += sample.engineMessages;
        metrics.engineMessagesMax = Math.max(metrics.engineMessagesMax, sample.engineMessages);
        metrics.responsesTotal += sample.responses;
        metrics.responsesMax = Math.max(metrics.responsesMax, sample.responses);
    }
    recordSharedSnapshot() {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        this.snapshotPerformance.sharedSnapshots++;
    }
    recordSharedFragmentHit() {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        this.snapshotPerformance.sharedFragmentHits++;
    }
    recordSharedFragmentBuild(sample) {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        const metrics = this.snapshotPerformance;
        metrics.sharedFragmentBuilds++;
        metrics.sharedFragmentCollectTotalMs += sample.collectMs;
        metrics.sharedFragmentCollectMaxMs = Math.max(metrics.sharedFragmentCollectMaxMs, sample.collectMs);
        metrics.sharedFragmentCountTotalMs += sample.countMs;
        metrics.sharedFragmentCountMaxMs = Math.max(metrics.sharedFragmentCountMaxMs, sample.countMs);
        metrics.sharedFragmentWriteTotalMs += sample.writeMs;
        metrics.sharedFragmentWriteMaxMs = Math.max(metrics.sharedFragmentWriteMaxMs, sample.writeMs);
        metrics.sharedFragmentBytesTotal += sample.bytes;
        metrics.sharedFragmentBytesMax = Math.max(metrics.sharedFragmentBytesMax, sample.bytes);
    }
    recordSharedFragmentCopy(copyMs, bytes) {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        const metrics = this.snapshotPerformance;
        metrics.sharedFragmentCopyTotalMs += copyMs;
        metrics.sharedFragmentCopyMaxMs = Math.max(metrics.sharedFragmentCopyMaxMs, copyMs);
        metrics.sharedFragmentCopyBytesTotal += bytes;
    }
    recordSharedMessageFragmentHit() {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        this.snapshotPerformance.sharedMessageFragmentHits++;
    }
    recordSharedMessageFragmentBuild(sample) {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        const metrics = this.snapshotPerformance;
        metrics.sharedMessageFragmentBuilds++;
        metrics.sharedMessageFragmentCountTotalMs += sample.countMs;
        metrics.sharedMessageFragmentCountMaxMs = Math.max(metrics.sharedMessageFragmentCountMaxMs, sample.countMs);
        metrics.sharedMessageFragmentWriteTotalMs += sample.writeMs;
        metrics.sharedMessageFragmentWriteMaxMs = Math.max(metrics.sharedMessageFragmentWriteMaxMs, sample.writeMs);
        metrics.sharedMessageFragmentBytesTotal += sample.bytes;
        metrics.sharedMessageFragmentBytesMax = Math.max(metrics.sharedMessageFragmentBytesMax, sample.bytes);
        metrics.sharedMessageFragmentMessagesTotal += sample.messages;
    }
    recordSharedMessageFragmentCopy(copyMs, bytes) {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        const metrics = this.snapshotPerformance;
        metrics.sharedMessageFragmentCopyTotalMs += copyMs;
        metrics.sharedMessageFragmentCopyMaxMs = Math.max(metrics.sharedMessageFragmentCopyMaxMs, copyMs);
        metrics.sharedMessageFragmentCopyBytesTotal += bytes;
    }
    recordSnapshotSend(sendMs) {
        if (!this.snapshotPerformanceEnabled) {
            return;
        }
        const metrics = this.snapshotPerformance;
        metrics.sendTotalMs += sendMs;
        metrics.sendMaxMs = Math.max(metrics.sendMaxMs, sendMs);
    }
    resetSnapshotPerformance() {
        this.snapshotPerformance = createSnapshotPerformanceWindow();
    }
    resetSharedUpdateFragments() {
        this.sharedUpdateFragments.clear();
        this.sharedCreateFragments.clear();
        this.sharedDeleteFragments.clear();
        this.sharedMessageFragments.clear();
    }
    getProtocol() {
        return {
            nidType: this.instance.localState.nidType,
            ntypeType: this.instance.context.ntypeType
        };
    }
    createProtocolEngineMessage() {
        const protocol = this.getProtocol();
        return {
            ntype: EngineMessage_1.EngineMessage.Protocol,
            nidType: protocol.nidType,
            ntypeType: protocol.ntypeType
        };
    }
    queueProtocolIfChanged(user) {
        const protocol = this.getProtocol();
        if (user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType) {
            user.queueEngineMessage(this.createProtocolEngineMessage());
            user.protocol = Object.assign({}, protocol);
        }
    }
    queueResponse(user, requestId, endpoint, response) {
        var _a;
        user.responseQueue.push({
            requestId,
            status: Endpoint_1.ResponseStatus.Ok,
            payload: (0, EndpointPayload_1.createEndpointPayload)(response, (_a = endpoint.endpoint) === null || _a === void 0 ? void 0 : _a.responseSchema)
        });
    }
    queueErrorResponse(user, requestId, code, message) {
        user.responseQueue.push({
            requestId,
            status: Endpoint_1.ResponseStatus.Error,
            payload: (0, EndpointPayload_1.createEndpointPayload)(errorPayload(code, message))
        });
    }
    reportResponseBacklog(user, queued, sent) {
        const remaining = user.responseQueue.length;
        if (remaining === 0) {
            this.responseBacklogUsers.delete(user);
            return;
        }
        if (!this.responseBacklogUsers.has(user)) {
            this.responseBacklogUsers.add(user);
            this.onResponseBacklog({
                user,
                queued,
                sent,
                remaining,
                tick: this.instance.tick
            });
        }
    }
    runRequestHandler(user, requestId, endpoint, body) {
        let sent = false;
        const send = (response) => {
            if (sent) {
                return;
            }
            sent = true;
            this.queueResponse(user, requestId, endpoint, response);
        };
        try {
            const result = endpoint.callback({ user, body }, send);
            if (result && typeof result.then === 'function') {
                ;
                result
                    .then(response => {
                    if (response !== undefined) {
                        send(response);
                    }
                })
                    .catch(err => {
                    if (!sent) {
                        this.queueErrorResponse(user, requestId, 'HANDLER_REJECTED', 'Request handler rejected.');
                    }
                });
            }
            else if (result !== undefined) {
                send(result);
            }
        }
        catch (err) {
            if (!sent) {
                this.queueErrorResponse(user, requestId, 'HANDLER_ERROR', 'Request handler errored.');
            }
        }
    }
    processRequests(max = Number.POSITIVE_INFINITY) {
        let processed = 0;
        while (processed < max && !this.requestQueue.isEmpty()) {
            const request = this.requestQueue.next();
            processed++;
            if (!request.endpoint) {
                this.queueErrorResponse(request.user, request.requestId, 'NO_ENDPOINT', 'No response handler is registered for this endpoint.');
                continue;
            }
            this.runRequestHandler(request.user, request.requestId, request.endpoint, request.body);
        }
        return processed;
    }
    onOpen(user) {
        user.connectionState = User_1.UserConnectionState.OpenPreHandshake;
        user.network = this;
    }
    onHandshake(user_1, handshake_1) {
        return __awaiter(this, arguments, void 0, function* (user, handshake, clientSchemaFingerprint = '') {
            try {
                user.connectionState = User_1.UserConnectionState.OpenAwaitingHandshake;
                if (this.requireSchemaFingerprint) {
                    const serverSchemaFingerprint = (0, schemaFingerprint_1.createSchemaFingerprint)(this.instance.context);
                    if (!clientSchemaFingerprint) {
                        throw new Error(`Schema fingerprint required. Server fingerprint ${serverSchemaFingerprint}.`);
                    }
                    if (clientSchemaFingerprint !== serverSchemaFingerprint) {
                        throw new Error(`Schema fingerprint mismatch. Client ${clientSchemaFingerprint}, server ${serverSchemaFingerprint}.`);
                    }
                }
                const connectionAccepted = yield this.instance.onConnect(handshake);
                if (connectionAccepted === false) {
                    throw new Error('Connection denied.');
                }
                // @ts-ignore typescript is wrong that connectionState does not change, it changes during the await
                if (user.connectionState === User_1.UserConnectionState.Closed) {
                    throw new Error('Connection closed before handshake completed.');
                }
                user.connectionState = User_1.UserConnectionState.Open;
                // allow
                const protocolMessage = this.createProtocolEngineMessage();
                const protocolSchema = this.instance.context.getEngineSchema(protocolMessage.ntype);
                const bw = user.networkAdapter.binary.createWriter(3 + (0, count_1.default)(protocolSchema, protocolMessage));
                bw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
                bw.writeUInt8(2);
                bw.writeUInt8(EngineMessage_1.EngineMessage.ConnectionAccepted);
                (0, writeMessage_1.writeMessage)(protocolMessage, protocolSchema, bw);
                user.send(bw.payload);
                user.instance = this.instance;
                user.protocol = Object.assign({}, this.getProtocol());
                this.onConnectionAccepted(user, connectionAccepted);
            }
            catch (err) {
                this.onConnectionDenied(user, err);
                // NOTE: we are keeping the code between these cases duplicated
                // if these do turn out to be identical in production we will clean it up
                // but for now I am suspicious that there will be different logic
                // in each of these later
                if (user.connectionState === User_1.UserConnectionState.OpenAwaitingHandshake) {
                    // developer's code decided to reject this connection (rejected promise)
                    const jsonErr = serializeConnectionError(err);
                    const denyReasonByteLength = countStringBytes(jsonErr);
                    // deny and send reason
                    const bw = user.networkAdapter.binary.createWriter(3 + denyReasonByteLength);
                    bw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
                    bw.writeUInt8(1);
                    bw.writeUInt8(EngineMessage_1.EngineMessage.ConnectionDenied);
                    bw.writeString(jsonErr);
                    user.send(bw.payload);
                }
                if (user.connectionState === User_1.UserConnectionState.Open) {
                    // a loss of connection after handshake is complete
                    const jsonErr = serializeConnectionError(err);
                    const denyReasonByteLength = countStringBytes(jsonErr);
                    // deny and send reason
                    const bw = user.networkAdapter.binary.createWriter(3 + denyReasonByteLength);
                    bw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
                    bw.writeUInt8(1);
                    bw.writeUInt8(EngineMessage_1.EngineMessage.ConnectionDenied);
                    bw.writeString(jsonErr);
                    user.send(bw.payload);
                }
            }
        });
    }
    onMessage(user, buffer) {
        var _a;
        try {
            const serverReceivedTimeMs = performance.now();
            const binaryReader = user.networkAdapter.binary.createReader(buffer);
            const commands = [];
            const commandTimingInputs = [];
            const commandSet = {
                type: NetworkEvent_1.NetworkEvent.CommandSet,
                user,
                commands,
                clientTick: -1,
                commandTimings: [],
                serverReceivedTimeMs
            };
            while (binaryReader.offset < binaryReader.byteLength) {
                const section = binaryReader.readUInt8();
                switch (section) {
                    case BinarySection_1.BinarySection.EngineMessages: {
                        const count = binaryReader.readUInt8();
                        for (let i = 0; i < count; i++) {
                            const msg = (0, readEngineMessage_1.default)(binaryReader, this.instance.context);
                            if (msg.ntype === EngineMessage_1.EngineMessage.ConnectionAttempt) {
                                const handshake = JSON.parse(msg.handshake);
                                this.onHandshake(user, handshake, msg.schemaFingerprint || '');
                            }
                            if (msg.ntype === EngineMessage_1.EngineMessage.ClientTick) {
                                const clientTick = msg.tick;
                                user.lastReceivedClientTick = clientTick;
                                commandSet.clientTick = clientTick;
                            }
                            if (msg.ntype === EngineMessage_1.EngineMessage.Pong) {
                                user.recordClockSyncPong({
                                    pingId: msg.pingId,
                                    serverTimeMs: msg.serverTimeMs,
                                    clientReceiveTimeMs: msg.clientReceiveTimeMs,
                                    clientSendTimeMs: msg.clientSendTimeMs
                                }, serverReceivedTimeMs);
                            }
                            if (msg.ntype === EngineMessage_1.EngineMessage.CommandTiming) {
                                commandTimingInputs.push({
                                    commandIndex: msg.commandIndex,
                                    clientTimeMs: msg.clientTimeMs,
                                    renderDelayMs: msg.renderDelayMs,
                                    viewTick: msg.viewTick,
                                    viewServerTimeMs: msg.viewServerTimeMs
                                });
                            }
                            if (msg.ntype === EngineMessage_1.EngineMessage.InterpolationDelay) {
                                user.recordInterpolationDelay(msg.delayMs, serverReceivedTimeMs);
                            }
                        }
                        break;
                    }
                    case BinarySection_1.BinarySection.Commands: {
                        const count = binaryReader.readUInt8();
                        for (let i = 0; i < count; i++) {
                            const msg = (0, readMessage_1.default)(binaryReader, this.instance.context, this.instance.context.ntypeType);
                            commands.push(msg);
                        }
                        break;
                    }
                    case BinarySection_1.BinarySection.Requests: {
                        const count = binaryReader.readUInt8();
                        for (let i = 0; i < count; i++) {
                            const requestId = binaryReader.readUInt32();
                            const endpoint = binaryReader.readUInt32();
                            const payloadByteLength = binaryReader.readUInt32();
                            if (user.connectionState !== User_1.UserConnectionState.Open) {
                                (0, EndpointPayload_1.skipEndpointPayload)(binaryReader, payloadByteLength);
                                this.queueErrorResponse(user, requestId, 'NOT_OPEN', 'Request received before the connection was open.');
                                continue;
                            }
                            const responseEndpoint = this.instance.responseEndPoints.get(endpoint);
                            if (!responseEndpoint) {
                                (0, EndpointPayload_1.skipEndpointPayload)(binaryReader, payloadByteLength);
                                this.requestQueue.enqueue({ user, requestId, endpointId: endpoint });
                            }
                            else {
                                const body = (0, EndpointPayload_1.readSizedEndpointPayload)(binaryReader, payloadByteLength, (_a = responseEndpoint.endpoint) === null || _a === void 0 ? void 0 : _a.requestSchema);
                                this.requestQueue.enqueue({
                                    user,
                                    requestId,
                                    endpointId: endpoint,
                                    endpoint: responseEndpoint,
                                    body
                                });
                            }
                        }
                        break;
                    }
                    default: {
                        console.log('network hit default case while reading');
                        break;
                    }
                }
            }
            for (let i = 0; i < commandTimingInputs.length; i++) {
                const input = commandTimingInputs[i];
                if (input.commandIndex >= 0 && input.commandIndex < commands.length) {
                    commandSet.commandTimings[input.commandIndex] = user.estimateCommandTiming(input, serverReceivedTimeMs);
                }
            }
            this.instance.queue.enqueue(commandSet);
        }
        catch (err) {
            // TODO there should be a way for a user to capture this error, perhaps a handler
            //console.log('on message err triggered', err)
            try {
                user.networkAdapter.disconnect(user, {});
            }
            catch (err2) {
                // TODO this is only in the case of an error while disconnecting
                // can these really occur?
            }
        }
    }
    onConnectionAccepted(user, payload) {
        user.network = this;
        user.id = ++this.instance.incrementalUserId;
        this.instance.users.set(user.id, user);
        this.instance.queue.enqueue({
            type: NetworkEvent_1.NetworkEvent.UserConnected,
            user,
            payload
        });
    }
    onConnectionDenied(user, payload) {
        this.instance.queue.enqueue({
            type: NetworkEvent_1.NetworkEvent.UserConnectionDenied,
            user,
            payload
        });
    }
    onClose(user) {
        this.responseBacklogUsers.delete(user);
        if (user.connectionState === User_1.UserConnectionState.Open) {
            this.instance.queue.enqueue({
                type: NetworkEvent_1.NetworkEvent.UserDisconnected,
                user,
            });
            this.instance.users.delete(user.id);
        }
        user.connectionState = User_1.UserConnectionState.Closed;
    }
}
exports.InstanceNetwork = InstanceNetwork;
