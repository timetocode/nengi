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
function countStringBytes(value) {
    return (0, BinaryExt_1.binaryGet)(Binary_1.Binary.String).byteSize(value);
}
function errorPayload(code, message) {
    return { code, message };
}
class InstanceNetwork {
    constructor(instance) {
        this.responseBacklogUsers = new Set();
        this.onResponseBacklog = (info) => {
            console.warn(`nengi response backlog: ${info.remaining} responses remain queued for user ${info.user.id} after sending ${info.sent} of ${info.queued} on server tick ${info.tick}.`);
        };
        this.instance = instance;
    }
    onRequest() {
        // TODO
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
    onOpen(user) {
        user.connectionState = User_1.UserConnectionState.OpenPreHandshake;
        user.network = this;
    }
    onHandshake(user, handshake) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                user.connectionState = User_1.UserConnectionState.OpenAwaitingHandshake;
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
                    const jsonErr = JSON.stringify(err);
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
                    const jsonErr = JSON.stringify(err);
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
            const binaryReader = user.networkAdapter.binary.createReader(buffer);
            const commands = [];
            const commandSet = {
                type: NetworkEvent_1.NetworkEvent.CommandSet,
                user,
                commands,
                clientTick: -1
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
                                this.onHandshake(user, handshake);
                            }
                            if (msg.ntype === EngineMessage_1.EngineMessage.ClientTick) {
                                const clientTick = msg.tick;
                                user.lastReceivedClientTick = clientTick;
                                commandSet.clientTick = clientTick;
                            }
                            if (msg.ntype === EngineMessage_1.EngineMessage.Pong) {
                                user.calculateLatency();
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
                            const responseEndpoint = this.instance.responseEndPoints.get(endpoint);
                            if (!responseEndpoint) {
                                (0, EndpointPayload_1.skipEndpointPayload)(binaryReader, payloadByteLength);
                                this.queueErrorResponse(user, requestId, 'NO_ENDPOINT', 'No response handler is registered for this endpoint.');
                            }
                            else {
                                const body = (0, EndpointPayload_1.readSizedEndpointPayload)(binaryReader, payloadByteLength, (_a = responseEndpoint.endpoint) === null || _a === void 0 ? void 0 : _a.requestSchema);
                                this.runRequestHandler(user, requestId, responseEndpoint, body);
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
