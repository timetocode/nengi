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
const EngineMessage_1 = require("../common/EngineMessage");
const BinarySection_1 = require("../common/binary/BinarySection");
const count_1 = __importDefault(require("../binary/message/count"));
const readEngineMessage_1 = __importDefault(require("../binary/message/readEngineMessage"));
const Chronus_1 = require("./Chronus");
const Outbound_1 = require("./Outbound");
const Frame_1 = require("./Frame");
class ClientNetwork {
    constructor(client) {
        this.client = client;
        this.entities = new Map();
        this.snapshots = [];
        this.frames = [];
        this.latestFrame = null;
        this.messages = [];
        this.predictionErrorFrames = [];
        this.outbound = new Outbound_1.Outbound();
        this.socket = null;
        this.requestId = 1;
        this.requestQueue = new NQueue_1.NQueue();
        this.requests = new Map();
        this.clientTick = 1;
        this.previousSnapshot = null;
        this.chronus = new Chronus_1.Chronus();
        this.onDisconnect = (reason, event) => {
            this.client.disconnectHandler(reason, event);
        };
        this.onSocketError = (event) => {
            this.client.websocketErrorHandler(event);
        };
    }
    incrementClientTick() {
        this.clientTick++;
        if (this.clientTick > 65535) {
            this.clientTick = 1;
        }
    }
    addEngineCommand(command) {
        this.outbound.addEngineCommand(command);
        //this.outboundEngine.enqueue(command)
    }
    addCommand(command) {
        this.outbound.addCommand(command);
        //this.outbound.enqueue(command)
    }
    request(endpoint, payload, callback) {
        const obj = {
            endpoint,
            requestId: this.requestId++,
            body: JSON.stringify(payload),
            callback
        };
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
        const dw = binaryWriterCtor.create(handshakeByteLength + 2);
        dw.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
        dw.writeUInt8(1);
        (0, writeMessage_1.writeMessage)(handshakeMessage, connectAttemptSchema_1.connectionAttemptSchema, dw);
        return dw.buffer;
    }
    createOutboundBuffer(binaryWriterCtor) {
        const tick = this.clientTick;
        this.addEngineCommand({ ntype: EngineMessage_1.EngineMessage.ClientTick, tick });
        let bytes = 0;
        const isDebug = false;
        const debug = {};
        const { outboundEngineCommands, outboundCommands } = this.outbound.getCurrentFrame();
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
                bytes += (0, count_1.default)(this.client.context.getSchema(command.ntype), command);
            });
        }
        // count REQUESTS
        if (this.requestQueue.length > 0) {
            bytes += 1; // requests
            bytes += 1; // number of requests
            this.requestQueue.arr.forEach((request) => {
                bytes += 12 + request.body.length;
            });
        }
        // @ts-ignore
        const dw = binaryWriterCtor.create(bytes);
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
                (0, writeMessage_1.writeMessage)(command, this.client.context.getSchema(command.ntype), dw);
            });
        }
        if (isDebug) {
            debug.commands = [];
            outboundCommands.forEach((command) => {
                debug.commands.push(command);
            });
        }
        // write REQUESTS
        if (this.requestQueue.length > 0) {
            dw.writeUInt8(BinarySection_1.BinarySection.Requests);
            dw.writeUInt8(this.requestQueue.arr.length);
            this.requestQueue.arr.forEach((request) => {
                dw.writeUInt32(request.requestId);
                dw.writeUInt32(request.endpoint);
                dw.writeString(request.body);
            });
            this.requestQueue.arr = [];
        }
        if (isDebug) {
            debug.tick = tick;
            console.log({ debug });
        }
        this.outbound.tick = tick;
        this.incrementClientTick();
        return dw.buffer;
    }
    readSnapshot(dr) {
        const snapshot = {
            timestamp: -1,
            confirmedClientTick: -1,
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
                            request.callback(JSON.parse(response));
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
        // frame creation from snapshot and prediction
        const frame = new Frame_1.Frame(snapshot, this.latestFrame);
        this.frames.push(frame);
        this.latestFrame = frame;
        const predictionErrorFrame = this.client.predictor.getErrors(frame);
        if (predictionErrorFrame.entities.size > 0) {
            this.client.network.predictionErrorFrames.push(predictionErrorFrame);
        }
        this.client.predictor.cleanUp(frame.confirmedClientTick);
        // commands/prediction
        this.outbound.confirmCommands(snapshot.confirmedClientTick);
        this.previousSnapshot = snapshot;
        this.snapshots.push(snapshot);
    }
}
exports.ClientNetwork = ClientNetwork;
