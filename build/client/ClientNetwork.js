"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientNetwork = void 0;
const NQueue_1 = __importDefault(require("../NQueue"));
const writeMessage_1 = require("../binary/message/writeMessage");
const connectAttemptSchema_1 = require("../common/schemas/connectAttemptSchema");
const readMessage_1 = __importDefault(require("../binary/message/readMessage"));
const readDiff_1 = __importDefault(require("../binary/entity/readDiff"));
const EngineMessage_1 = require("../common/EngineMessage");
const BinarySection_1 = require("../common/binary/BinarySection");
const count_1 = __importDefault(require("../binary/message/count"));
const readEngineMessage_1 = __importDefault(require("../binary/message/readEngineMessage"));
class ClientNetwork {
    constructor(client) {
        this.client = client;
        this.entities = new Map();
        this.snapshots = [];
        this.messages = [];
        this.outbound = new NQueue_1.default();
        this.socket = null;
        this.requestId = 1;
        this.requestQueue = new NQueue_1.default();
        this.requests = new Map();
        this.onDisconnect = (reason) => {
            console.log('disconnected by server! to Handle disconnect with your own logic add a client.onDisconnect = (reason: string) => {}');
        };
        this.onSocketError = (event) => {
            console.log('socket error', event);
        };
    }
    addCommand(command) {
        this.outbound.enqueue(command);
    }
    request(endpoint, payload, callback) {
        const obj = {
            endpoint,
            requestId: this.requestId++,
            body: JSON.stringify(payload),
            callback
        };
        //console.log(obj)
        this.requestQueue.enqueue(obj);
        this.requests.set(obj.requestId, obj);
    }
    createHandshakeBuffer(handshake, binaryWriterCtor) {
        const handshakeMessage = {
            ntype: EngineMessage_1.EngineMessage.ConnectionAttempt,
            handshake: JSON.stringify(handshake)
        };
        const handshakeByteLength = (0, count_1.default)(connectAttemptSchema_1.connectionAttemptSchema, handshakeMessage);
        // @ts-ignore
        const dw = binaryWriterCtor.create(handshakeByteLength + 3);
        dw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
        dw.writeUInt8(1);
        dw.writeUInt8(EngineMessage_1.EngineMessage.ConnectionAttempt);
        (0, writeMessage_1.writeMessage)(handshakeMessage, connectAttemptSchema_1.connectionAttemptSchema, dw);
        return dw.buffer;
    }
    createOutboundBuffer(binaryWriterCtor) {
        let bytes = 0;
        bytes += 1; // commands!
        bytes += 1; // number of commands
        this.outbound.arr.forEach((command) => {
            bytes += (0, count_1.default)(this.client.context.getSchema(command.ntype), command);
        });
        bytes += 1; // requests
        bytes += 1; // number of requests
        this.requestQueue.arr.forEach((request) => {
            bytes += 12 + request.body.length;
        });
        // @ts-ignore
        const dw = binaryWriterCtor.create(bytes);
        dw.writeUInt8(BinarySection_1.BinarySection.Commands);
        dw.writeUInt8(this.outbound.arr.length);
        this.outbound.arr.forEach((command) => {
            (0, writeMessage_1.writeMessage)(command, this.client.context.getSchema(command.ntype), dw);
        });
        this.outbound.arr = [];
        dw.writeUInt8(BinarySection_1.BinarySection.Requests);
        dw.writeUInt8(this.requestQueue.arr.length);
        this.requestQueue.arr.forEach((request) => {
            dw.writeUInt32(request.requestId);
            dw.writeUInt32(request.endpoint);
            dw.writeString(request.body);
        });
        this.requestQueue.arr = [];
        return dw.buffer;
    }
    readSnapshot(dr) {
        const snapshot = {
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        };
        while (dr.offset < dr.byteLength) {
            const section = dr.readUInt8();
            switch (section) {
                case BinarySection_1.BinarySection.EngineMessages: {
                    const count = dr.readUInt8();
                    for (let i = 0; i < count; i++) {
                        const engineMessage = (0, readEngineMessage_1.default)(dr, this.client.context);
                        //console.log(engineMessage)
                        if (engineMessage.ntype === EngineMessage_1.EngineMessage.ConnectionTerminated) {
                            // @ts-ignore
                            console.log('connection terminated reason!', engineMessage.reason);
                        }
                    }
                    break;
                }
                case BinarySection_1.BinarySection.Messages: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const message = (0, readMessage_1.default)(dr, this.client.context);
                        this.messages.push(message);
                    }
                    break;
                }
                case BinarySection_1.BinarySection.Responses: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const requestId = dr.readUInt32();
                        const response = dr.readString();
                        const request = this.requests.get(requestId);
                        if (request) {
                            request.callback(response);
                            this.requests.delete(requestId);
                        }
                    }
                    break;
                }
                case BinarySection_1.BinarySection.CreateEntities: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        //const entity = readEntity(dr, this.client.context)
                        const entity = (0, readMessage_1.default)(dr, this.client.context);
                        this.entities.set(entity.nid, entity);
                        snapshot.createEntities.push(entity);
                    }
                    break;
                }
                case BinarySection_1.BinarySection.UpdateEntities: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const diff = (0, readDiff_1.default)(dr, this.client.context, this.entities);
                        snapshot.updateEntities.push(diff);
                    }
                    break;
                }
                case BinarySection_1.BinarySection.DeleteEntities: {
                    const count = dr.readUInt32();
                    for (let i = 0; i < count; i++) {
                        const nid = dr.readUInt32();
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
        this.snapshots.push(snapshot);
    }
}
exports.ClientNetwork = ClientNetwork;
//# sourceMappingURL=ClientNetwork.js.map