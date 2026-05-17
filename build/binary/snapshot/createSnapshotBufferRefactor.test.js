"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const createSnapshotBufferRefactor_1 = __importStar(require("./createSnapshotBufferRefactor"));
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const Endpoint_1 = require("../../common/Endpoint");
const ClientNetwork_1 = require("../../client/ClientNetwork");
const Channel_1 = require("../../server/Channel");
const Instance_1 = require("../../server/Instance");
const User_1 = require("../../server/User");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
const EndpointPayload_1 = require("../endpoint/EndpointPayload");
var NType;
(function (NType) {
    NType[NType["Entity"] = 1] = "Entity";
    NType[NType["Message"] = 2] = "Message";
})(NType || (NType = {}));
function createContext() {
    const context = new Context_1.Context();
    context.register(NType.Entity, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        label: Binary_1.Binary.String
    }));
    context.register(NType.Message, (0, defineSchema_1.defineMessageSchema)({
        text: Binary_1.Binary.String
    }));
    return context;
}
function createUser(instance) {
    const user = new User_1.User(undefined, {
        binary: BufferBinary_1.testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    });
    user.id = 1;
    user.instance = instance;
    return user;
}
function createClientNetwork(context) {
    const client = {
        context,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        predictor: {
            getErrors: jest.fn(() => ({ entities: new Map() })),
            cleanUp: jest.fn()
        },
        network: undefined
    };
    const network = new ClientNetwork_1.ClientNetwork(client);
    client.network = network;
    return network;
}
describe('server snapshot pipeline', () => {
    it('collects visible create, update, delete, queued message, and response state', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        channel.subscribe(user);
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'switch'
        });
        const nid = entity.nid;
        const message = { ntype: NType.Message, text: 'hello' };
        user.queueMessage(message);
        user.responseQueue.push({ requestId: 77, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ ok: true }) });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        const first = (0, createSnapshotBufferRefactor_1.collectSnapshotPlan)(user, instance);
        expect(first.createEntities).toEqual([entity]);
        expect(first.updateEntities).toEqual([]);
        expect(first.deleteEntities).toEqual([]);
        expect(first.messages).toEqual([message]);
        expect(first.responses).toEqual([{ requestId: 77, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ ok: true }) }]);
        expect(user.messageQueue).toEqual([]);
        expect(user.responseQueue).toEqual([{ requestId: 77, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ ok: true }) }]);
        entity.x = 9;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        const second = (0, createSnapshotBufferRefactor_1.collectSnapshotPlan)(user, instance);
        expect(second.createEntities).toEqual([]);
        expect(second.updateEntities).toEqual([
            expect.objectContaining({ nid, prop: 'x', value: 9 })
        ]);
        expect(second.deleteEntities).toEqual([]);
        channel.unsubscribe(user);
        instance.tick = 3;
        instance.cache.createCachesForTick(instance.tick);
        const third = (0, createSnapshotBufferRefactor_1.collectSnapshotPlan)(user, instance);
        expect(third.createEntities).toEqual([]);
        expect(third.updateEntities).toEqual([]);
        expect(third.deleteEntities).toEqual([nid]);
    });
    it('counts and writes a collected snapshot plan', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        channel.subscribe(user);
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        user.queueMessage({ ntype: NType.Message, text: 'created' });
        user.responseQueue.push({ requestId: 77, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ ok: true }) });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        const plan = (0, createSnapshotBufferRefactor_1.collectSnapshotPlan)(user, instance);
        const byteLength = (0, createSnapshotBufferRefactor_1.countSnapshotBytes)(plan, context);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, createSnapshotBufferRefactor_1.writeSnapshot)(plan, context, writer);
        expect(writer.offset).toBe(byteLength);
        expect(user.responseQueue).toHaveLength(1);
        user.responseQueue.push({ requestId: 78, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ late: true }) });
        (0, createSnapshotBufferRefactor_1.commitSnapshotPlan)(user, plan);
        expect(user.responseQueue).toEqual([{ requestId: 78, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ late: true }) }]);
    });
    it('collects at most 255 queued responses per user frame', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        for (let i = 1; i <= 256; i++) {
            user.responseQueue.push({
                requestId: i,
                status: Endpoint_1.ResponseStatus.Ok,
                payload: (0, EndpointPayload_1.createEndpointPayload)({ i })
            });
        }
        const first = (0, createSnapshotBufferRefactor_1.collectSnapshotPlan)(user, instance);
        expect(first.responses).toHaveLength(255);
        expect(first.responses[0].requestId).toBe(1);
        expect(first.responses[254].requestId).toBe(255);
        (0, createSnapshotBufferRefactor_1.commitSnapshotPlan)(user, first);
        expect(user.responseQueue).toHaveLength(1);
        expect(user.responseQueue[0].requestId).toBe(256);
        const second = (0, createSnapshotBufferRefactor_1.collectSnapshotPlan)(user, instance);
        expect(second.responses).toHaveLength(1);
        expect(second.responses[0].requestId).toBe(256);
    });
    it('reports response backlog once after a capped user frame', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const onResponseBacklog = jest.fn();
        instance.tick = 7;
        instance.network.onResponseBacklog = onResponseBacklog;
        for (let i = 1; i <= 256; i++) {
            user.responseQueue.push({
                requestId: i,
                status: Endpoint_1.ResponseStatus.Ok,
                payload: (0, EndpointPayload_1.createEndpointPayload)({ i })
            });
        }
        (0, createSnapshotBufferRefactor_1.default)(user, instance);
        expect(user.responseQueue).toHaveLength(1);
        expect(onResponseBacklog).toHaveBeenCalledWith({
            user,
            queued: 256,
            sent: 255,
            remaining: 1,
            tick: 7
        });
        (0, createSnapshotBufferRefactor_1.default)(user, instance);
        expect(user.responseQueue).toHaveLength(0);
        expect(onResponseBacklog).toHaveBeenCalledTimes(1);
    });
    it('sends a protocol update before entity sections when nid width grows', () => {
        var _a;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        const clientNetwork = createClientNetwork(context);
        channel.subscribe(user);
        for (let i = 0; i < 256; i++) {
            channel.addEntity({
                nid: 0,
                ntype: NType.Entity,
                x: i,
                y: i,
                label: `entity:${i}`
            });
        }
        expect(instance.localState.nidType).toBe(Binary_1.Binary.UInt16);
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        const buffer = (0, createSnapshotBufferRefactor_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(buffer));
        expect(clientNetwork.protocol.nidType).toBe(Binary_1.Binary.UInt16);
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities).toHaveLength(256);
        expect(clientNetwork.store.get(257)).toEqual({
            nid: 257,
            ntype: NType.Entity,
            x: 255,
            y: 255,
            label: 'entity:255'
        });
    });
    it('creates snapshot buffers that the client can consume as raw frames', () => {
        var _a, _b, _c, _d, _e;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        const clientNetwork = createClientNetwork(context);
        channel.subscribe(user);
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        const nid = entity.nid;
        user.queueMessage({ ntype: NType.Message, text: 'created' });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        const createBuffer = (0, createSnapshotBufferRefactor_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(createBuffer));
        expect(clientNetwork.messages).toEqual([
            { ntype: NType.Message, text: 'created' }
        ]);
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities).toEqual([
            { nid, ntype: NType.Entity, x: 5, y: 6, label: 'door' }
        ]);
        expect(clientNetwork.store.get(nid)).toEqual({
            nid,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        entity.x = 11;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        const updateBuffer = (0, createSnapshotBufferRefactor_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(updateBuffer));
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities).toEqual([]);
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ]);
        expect((_d = clientNetwork.store.get(nid)) === null || _d === void 0 ? void 0 : _d.x).toBe(11);
        channel.removeEntity(entity);
        instance.tick = 3;
        instance.cache.createCachesForTick(instance.tick);
        const deleteBuffer = (0, createSnapshotBufferRefactor_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(deleteBuffer));
        expect((_e = clientNetwork.latestFrame) === null || _e === void 0 ? void 0 : _e.deleteEntities).toEqual([nid]);
        expect(clientNetwork.store.entities.has(nid)).toBe(false);
        expect(clientNetwork.entityNTypes.has(nid)).toBe(false);
    });
    it('drains applied frames in receive order without duplicating authoritative state', () => {
        var _a;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        const clientNetwork = createClientNetwork(context);
        channel.subscribe(user);
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'piece'
        });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBufferRefactor_1.default)(user, instance)));
        entity.x = 3;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBufferRefactor_1.default)(user, instance)));
        const frames = clientNetwork.drainFrames();
        expect(frames).toHaveLength(2);
        expect(frames[0].createEntities).toHaveLength(1);
        expect(frames[1].updateEntities).toEqual([
            { nid: entity.nid, prop: 'x', previous: 1, value: 3 }
        ]);
        expect(clientNetwork.drainFrames()).toEqual([]);
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(3);
    });
});
