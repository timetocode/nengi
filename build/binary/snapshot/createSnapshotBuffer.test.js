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
const createSnapshotBuffer_1 = __importStar(require("./createSnapshotBuffer"));
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const Endpoint_1 = require("../../common/Endpoint");
const ClientNetwork_1 = require("../../client/ClientNetwork");
const AABB2D_1 = require("../../server/channel/AABB2D");
const AABB3D_1 = require("../../server/channel/AABB3D");
const SpatialChannel2D_1 = require("../../server/channel/SpatialChannel2D");
const SpatialChannel3D_1 = require("../../server/channel/SpatialChannel3D");
const Channel_1 = require("../../server/channel/Channel");
const ManualChannel_1 = require("../../server/channel/ManualChannel");
const ManualSpatialChannel2D_1 = require("../../server/channel/ManualSpatialChannel2D");
const ManualSpatialChannel3D_1 = require("../../server/channel/ManualSpatialChannel3D");
const EcsChannel_1 = require("../../server/channel/EcsChannel");
const EcsSpatialChannel2D_1 = require("../../server/channel/EcsSpatialChannel2D");
const EcsSpatialChannel3D_1 = require("../../server/channel/EcsSpatialChannel3D");
const Instance_1 = require("../../server/Instance");
const User_1 = require("../../server/User");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
const EndpointPayload_1 = require("../endpoint/EndpointPayload");
const BinaryDebugError_1 = require("../BinaryDebugError");
const SnapshotPlan_1 = require("./SnapshotPlan");
var NType;
(function (NType) {
    NType[NType["Entity"] = 1] = "Entity";
    NType[NType["Message"] = 2] = "Message";
    NType[NType["Transform"] = 3] = "Transform";
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
function createGroupedContext() {
    const context = new Context_1.Context();
    context.register(NType.Entity, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        label: Binary_1.Binary.String,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    }));
    context.register(NType.Message, (0, defineSchema_1.defineMessageSchema)({
        text: Binary_1.Binary.String
    }));
    return context;
}
function createGroupedContext3D() {
    const context = new Context_1.Context();
    context.register(NType.Entity, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        z: Binary_1.Binary.Float64,
        label: Binary_1.Binary.String,
        $options: {
            updateGroups: {
                transform: ['x', 'y', 'z']
            }
        }
    }));
    context.register(NType.Message, (0, defineSchema_1.defineMessageSchema)({
        text: Binary_1.Binary.String
    }));
    return context;
}
function createEcsContext() {
    const context = createContext();
    context.register(NType.Transform, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    }));
    return context;
}
function createEcsContext3D() {
    const context = createContext();
    context.register(NType.Transform, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        z: Binary_1.Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y', 'z']
            }
        }
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
function lastSentBuffer(user) {
    const send = user.networkAdapter.send;
    return send.mock.calls[send.mock.calls.length - 1][1];
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
        const first = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
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
        const second = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(second.createEntities).toEqual([]);
        expect(second.updateEntities).toEqual([
            expect.objectContaining({ nid, prop: 'x', value: 9 })
        ]);
        expect(second.deleteEntities).toEqual([]);
        channel.unsubscribe(user);
        instance.tick = 3;
        instance.cache.createCachesForTick(instance.tick);
        const third = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(third.createEntities).toEqual([]);
        expect(third.updateEntities).toEqual([]);
        expect(third.deleteEntities).toEqual([nid]);
    });
    it('does not miss a same-length all-visible channel membership replacement', () => {
        var _a, _b, _c;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new Channel_1.Channel(instance.localState);
        instance.users.set(user.id, user);
        channel.subscribe(user);
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'first'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        const firstNid = first.nid;
        channel.removeEntity(first);
        const replacement = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'replacement'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.deleteEntities).toEqual([firstNid]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities.map(entity => entity.nid)).toEqual([replacement.nid]);
        expect(clientNetwork.store.entities.has(firstNid)).toBe(false);
        expect((_c = clientNetwork.store.get(replacement.nid)) === null || _c === void 0 ? void 0 : _c.label).toBe('replacement');
    });
    it('collects hierarchy creates and updates parent-first, then deletes child-first', () => {
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        channel.subscribe(user);
        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        });
        const child = instance.localState.addChild(parent, {
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'child'
        });
        const parentNid = parent.nid;
        const childNid = child.nid;
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        const createPlan = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(createPlan.createEntities.map(entity => entity.nid)).toEqual([parentNid, childNid]);
        parent.x = 11;
        child.x = 13;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        const updatePlan = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(updatePlan.updateEntityGroups.map(update => update.nid)).toEqual([parentNid, childNid]);
        channel.removeEntity(parent);
        instance.tick = 3;
        instance.cache.createCachesForTick(instance.tick);
        const deletePlan = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(deletePlan.deleteEntities).toEqual([childNid, parentNid]);
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
        const plan = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        const byteLength = (0, createSnapshotBuffer_1.countSnapshotBytes)(plan, context);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, createSnapshotBuffer_1.writeSnapshot)(plan, context, writer);
        expect(writer.offset).toBe(byteLength);
        expect(user.responseQueue).toHaveLength(1);
        user.responseQueue.push({ requestId: 78, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ late: true }) });
        (0, createSnapshotBuffer_1.commitSnapshotPlan)(user, plan);
        expect(user.responseQueue).toEqual([{ requestId: 78, status: Endpoint_1.ResponseStatus.Ok, payload: (0, EndpointPayload_1.createEndpointPayload)({ late: true }) }]);
    });
    it('bundles grouped entity updates and expands them on the client', () => {
        var _a;
        const context = createGroupedContext();
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
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        clientNetwork.processNextFrame();
        entity.x = 11;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        const plan = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(plan.updateEntities).toEqual([]);
        expect(plan.updateEntityGroups).toHaveLength(1);
        expect(plan.updateEntityGroups[0].group.name).toBe('position');
        expect(plan.updateEntityGroups[0].values).toEqual([11, 6]);
        const byteLength = (0, createSnapshotBuffer_1.countSnapshotBytes)(plan, context);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, createSnapshotBuffer_1.writeSnapshot)(plan, context, writer);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(writer.buffer));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ]);
        expect(clientNetwork.store.get(nid)).toEqual({
            nid,
            ntype: NType.Entity,
            x: 11,
            y: 6,
            label: 'door'
        });
    });
    it('allows repeated update group sections in one snapshot', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        const clientNetwork = createClientNetwork(context);
        channel.subscribe(user);
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'first'
        });
        const second = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'second'
        });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        clientNetwork.processNextFrame();
        first.x = 11;
        second.x = 13;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        const collected = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        const firstPlan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
        const secondPlan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
        firstPlan.updateEntityGroups = [collected.updateEntityGroups[0]];
        secondPlan.updateEntityGroups = [collected.updateEntityGroups[1]];
        const byteLength = (0, createSnapshotBuffer_1.countSnapshotBytes)(firstPlan, context) + (0, createSnapshotBuffer_1.countSnapshotBytes)(secondPlan, context);
        const writer = BufferBinary_1.TestBufferWriter.create(byteLength);
        (0, createSnapshotBuffer_1.writeSnapshot)(firstPlan, context, writer);
        (0, createSnapshotBuffer_1.writeSnapshot)(secondPlan, context, writer);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(writer.buffer));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(first.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(11);
        expect((_b = clientNetwork.store.get(second.nid)) === null || _b === void 0 ? void 0 : _b.x).toBe(13);
    });
    it('can use shared update fragments for steady-state all-visible channels', () => {
        var _a, _b, _c, _d;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new Channel_1.Channel(instance.localState);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser);
        channel.subscribe(secondUser);
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        const child = instance.localState.addChild(entity, {
            nid: 0,
            ntype: NType.Entity,
            x: 15,
            y: 16,
            label: 'hinge'
        });
        const nid = entity.nid;
        const childNid = child.nid;
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        entity.x = 11;
        child.x = 21;
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(instance.network.sharedUpdateFragments.size).toBe(1);
        expect((_a = firstClient.store.get(nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(11);
        expect((_b = firstClient.store.get(childNid)) === null || _b === void 0 ? void 0 : _b.x).toBe(21);
        expect((_c = secondClient.store.get(nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(11);
        expect((_d = secondClient.store.get(childNid)) === null || _d === void 0 ? void 0 : _d.x).toBe(21);
    });
    it('writes manual grouped mutations directly', () => {
        var _a, _b, _c;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualChannel_1.ManualChannel(instance.localState);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        const position = Entity.position;
        instance.users.set(user.id, user);
        channel.subscribe(user);
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        entity.x = 11;
        entity.y = 12;
        position(entity, 11, 12);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(11);
        expect((_b = clientNetwork.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(12);
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.updateEntities.map(update => update.prop)).toEqual(['x', 'y']);
    });
    it('writes manual prop mutations directly', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualChannel_1.ManualChannel(instance.localState);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        const label = Entity.label;
        instance.users.set(user.id, user);
        channel.subscribe(user);
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        entity.label = 'gate';
        label(entity, 'gate');
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('gate');
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.updateEntities.map(update => update.prop)).toEqual(['label']);
    });
    it('does not scan ManualChannel entities in the mixed-channel fallback', () => {
        var _a, _b, _c;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const manualChannel = new ManualChannel_1.ManualChannel(instance.localState);
        const regularChannel = new Channel_1.Channel(instance.localState);
        const ManualEntity = manualChannel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        instance.users.set(user.id, user);
        manualChannel.subscribe(user);
        regularChannel.subscribe(user);
        const manualEntity = manualChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'manual'
        });
        const regularEntity = regularChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 15,
            y: 16,
            label: 'regular'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        manualEntity.x = 50;
        regularEntity.x = 150;
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(manualEntity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(5);
        expect((_b = clientNetwork.store.get(regularEntity.nid)) === null || _b === void 0 ? void 0 : _b.x).toBe(150);
        manualEntity.x = 55;
        ManualEntity.x(manualEntity, 55);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.store.get(manualEntity.nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(55);
    });
    it('writes manual spatial grouped mutations through cell fragments', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 100);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        const position = Entity.position;
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(50, 50, 60, 60));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        entity.x = 11;
        entity.y = 12;
        position(entity, 11, 12);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(11);
        expect((_b = clientNetwork.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(12);
        expect(instance.network.sharedUpdateFragments.size).toBe(1);
    });
    it('does not scan ManualSpatialChannel2D entities in the generic fallback', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 100);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(50, 50, 60, 60));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'manual-spatial'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        entity.label = 'direct-only';
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('manual-spatial');
        entity.label = 'manual-write';
        Entity.label(entity, 'manual-write');
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_b = clientNetwork.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.label).toBe('manual-write');
    });
    it('writes manual spatial 3D grouped mutations through cell fragments', () => {
        var _a, _b, _c, _d;
        const context = createGroupedContext3D();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualSpatialChannel3D_1.ManualSpatialChannel3D(instance.localState, 100);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB3D_1.AABB3D(50, 50, 50, 60, 60, 60));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'door-3d'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('door-3d');
        entity.x = 11;
        entity.y = 12;
        entity.z = 13;
        Entity.transform(entity, 11, 12, 13);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_b = clientNetwork.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.x).toBe(11);
        expect((_c = clientNetwork.store.get(entity.nid)) === null || _c === void 0 ? void 0 : _c.y).toBe(12);
        expect((_d = clientNetwork.store.get(entity.nid)) === null || _d === void 0 ? void 0 : _d.z).toBe(13);
        entity.z = 250;
        Entity.transform(entity, 11, 12, 250);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false);
    });
    it('writes manual spatial grouped child mutations through the parent cell fragment', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 100);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        const position = Entity.position;
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(50, 50, 60, 60));
        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        });
        const child = instance.attachChild(parent, {
            nid: 0,
            ntype: NType.Entity,
            x: 15,
            y: 16,
            label: 'child'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        child.x = 21;
        child.y = 22;
        position(child, 21, 22);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(child.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(21);
        expect((_b = clientNetwork.store.get(child.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(22);
        expect(instance.network.sharedUpdateFragments.size).toBe(1);
    });
    it('replicates ECS roots as ids and components as pid-owned state', () => {
        var _a, _b, _c, _d, _e, _f, _g;
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new EcsChannel_1.EcsChannel(instance.localState);
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        channel.subscribe(user);
        const pid = channel.createEntity();
        const transform = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 1,
            y: 2
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true);
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.ecsCreateEntities).toEqual([pid]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid]);
        expect(clientNetwork.store.get(transform.nid)).toEqual({
            nid: transform.nid,
            ntype: NType.Transform,
            pid,
            x: 1,
            y: 2
        });
        transform.x = 5;
        transform.y = 6;
        Transform.position(transform, 5, 6);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.store.get(transform.nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(5);
        expect((_d = clientNetwork.store.get(transform.nid)) === null || _d === void 0 ? void 0 : _d.y).toBe(6);
        const componentNid = transform.nid;
        channel.removeEntity(pid);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_e = clientNetwork.previousSnapshot) === null || _e === void 0 ? void 0 : _e.deleteEntities).toEqual([]);
        expect((_f = clientNetwork.latestFrame) === null || _f === void 0 ? void 0 : _f.ecsDeleteEntities).toEqual([pid]);
        expect((_g = clientNetwork.latestFrame) === null || _g === void 0 ? void 0 : _g.deleteEntities).toEqual([componentNid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false);
        expect(clientNetwork.store.entities.has(componentNid)).toBe(false);
    });
    it('does not scan ECS components without manual writer calls', () => {
        var _a, _b, _c, _d;
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new EcsChannel_1.EcsChannel(instance.localState);
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        channel.subscribe(user);
        const pid = channel.createEntity();
        const transform = channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 1,
            y: 2
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        transform.x = 5;
        transform.y = 6;
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(transform.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(1);
        expect((_b = clientNetwork.store.get(transform.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(2);
        transform.x = 7;
        transform.y = 8;
        Transform.position(transform, 7, 8);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.store.get(transform.nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(7);
        expect((_d = clientNetwork.store.get(transform.nid)) === null || _d === void 0 ? void 0 : _d.y).toBe(8);
    });
    it('can compose ECS and regular channels in one user snapshot', () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const ecsChannel = new EcsChannel_1.EcsChannel(instance.localState);
        const regularChannel = new Channel_1.Channel(instance.localState);
        const Transform = ecsChannel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        ecsChannel.subscribe(user);
        regularChannel.subscribe(user);
        const pid = ecsChannel.createEntity();
        const transform = ecsChannel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 1,
            y: 2
        });
        const regular = regularChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'regular'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.ecsCreateEntities).toEqual([pid]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid]);
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.createEntities.map(entity => entity.nid)).toEqual([transform.nid, regular.nid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true);
        expect((_d = clientNetwork.store.get(transform.nid)) === null || _d === void 0 ? void 0 : _d.x).toBe(1);
        expect((_e = clientNetwork.store.get(regular.nid)) === null || _e === void 0 ? void 0 : _e.label).toBe('regular');
        transform.x = 5;
        transform.y = 6;
        Transform.position(transform, 5, 6);
        regular.x = 7;
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_f = clientNetwork.store.get(transform.nid)) === null || _f === void 0 ? void 0 : _f.x).toBe(5);
        expect((_g = clientNetwork.store.get(transform.nid)) === null || _g === void 0 ? void 0 : _g.y).toBe(6);
        expect((_h = clientNetwork.store.get(regular.nid)) === null || _h === void 0 ? void 0 : _h.x).toBe(7);
        const transformNid = transform.nid;
        const regularNid = regular.nid;
        ecsChannel.removeEntity(pid);
        regularChannel.removeEntity(regular);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_j = clientNetwork.previousSnapshot) === null || _j === void 0 ? void 0 : _j.deleteEntities).toEqual([regularNid]);
        expect((_k = clientNetwork.latestFrame) === null || _k === void 0 ? void 0 : _k.ecsDeleteEntities).toEqual([pid]);
        expect((_l = clientNetwork.latestFrame) === null || _l === void 0 ? void 0 : _l.deleteEntities).toHaveLength(2);
        expect((_m = clientNetwork.latestFrame) === null || _m === void 0 ? void 0 : _m.deleteEntities).toEqual(expect.arrayContaining([transformNid, regularNid]));
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false);
        expect(clientNetwork.store.entities.has(transformNid)).toBe(false);
        expect(clientNetwork.store.entities.has(regularNid)).toBe(false);
    });
    it('sends unsubscribe deletes without merging away remaining channel updates', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const worldChannel = new Channel_1.Channel(instance.localState);
        const inventoryChannel = new Channel_1.Channel(instance.localState);
        instance.users.set(user.id, user);
        worldChannel.subscribe(user);
        inventoryChannel.subscribe(user);
        const worldEntity = worldChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'world'
        });
        const item = inventoryChannel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'item'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        const itemNid = item.nid;
        inventoryChannel.unsubscribe(user);
        worldEntity.x = 10;
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.deleteEntities).toEqual([itemNid]);
        expect((_b = clientNetwork.store.get(worldEntity.nid)) === null || _b === void 0 ? void 0 : _b.x).toBe(10);
        expect(clientNetwork.store.entities.has(itemNid)).toBe(false);
    });
    it('spatially replicates ECS roots from component state', () => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10);
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(5, 5, 10, 10));
        const pid = channel.createEntity();
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.ecsCreateEntities).toEqual([pid]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.ecsCreateComponents.map(component => component.nid)).toEqual([transform.nid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true);
        expect((_c = clientNetwork.store.get(transform.nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(5);
        transform.x = 6;
        transform.y = 7;
        Transform.position(transform, 6, 7);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_d = clientNetwork.store.get(transform.nid)) === null || _d === void 0 ? void 0 : _d.x).toBe(6);
        expect((_e = clientNetwork.store.get(transform.nid)) === null || _e === void 0 ? void 0 : _e.y).toBe(7);
        transform.x = 50;
        transform.y = 50;
        Transform.position(transform, 50, 50);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_f = clientNetwork.previousSnapshot) === null || _f === void 0 ? void 0 : _f.deleteEntities).toEqual([]);
        expect((_g = clientNetwork.latestFrame) === null || _g === void 0 ? void 0 : _g.ecsDeleteEntities).toEqual([pid]);
        expect((_h = clientNetwork.latestFrame) === null || _h === void 0 ? void 0 : _h.deleteEntities).toEqual([transform.nid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false);
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false);
    });
    it('does not scan ECS spatial components without manual writer calls', () => {
        var _a, _b, _c, _d;
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10);
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(5, 5, 10, 10));
        const pid = channel.createEntity();
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        transform.x = 6;
        transform.y = 7;
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(transform.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(5);
        expect((_b = clientNetwork.store.get(transform.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(5);
        transform.x = 8;
        transform.y = 9;
        Transform.position(transform, 8, 9);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.store.get(transform.nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(8);
        expect((_d = clientNetwork.store.get(transform.nid)) === null || _d === void 0 ? void 0 : _d.y).toBe(9);
    });
    it('spatially replicates ECS roots from 3D component state', () => {
        var _a, _b, _c, _d, _e, _f, _g;
        const context = createEcsContext3D();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new EcsSpatialChannel3D_1.EcsSpatialChannel3D(instance.localState, 10);
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB3D_1.AABB3D(5, 5, 5, 10, 10, 10));
        const pid = channel.createEntity();
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 5,
            z: 5
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.ecsCreateEntities).toEqual([pid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true);
        expect((_b = clientNetwork.store.get(transform.nid)) === null || _b === void 0 ? void 0 : _b.z).toBe(5);
        transform.x = 6;
        transform.y = 7;
        transform.z = 8;
        Transform.position(transform, 6, 7, 8);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.store.get(transform.nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(6);
        expect((_d = clientNetwork.store.get(transform.nid)) === null || _d === void 0 ? void 0 : _d.y).toBe(7);
        expect((_e = clientNetwork.store.get(transform.nid)) === null || _e === void 0 ? void 0 : _e.z).toBe(8);
        transform.z = 50;
        Transform.position(transform, 6, 7, 50);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_f = clientNetwork.latestFrame) === null || _f === void 0 ? void 0 : _f.ecsDeleteEntities).toEqual([pid]);
        expect((_g = clientNetwork.latestFrame) === null || _g === void 0 ? void 0 : _g.deleteEntities).toEqual([transform.nid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false);
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false);
    });
    it('spatially replicates ECS roots on the xz plane without copying z into y', () => {
        var _a, _b, _c, _d;
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10, { plane: 'xz' });
        const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
        instance.users.set(user.id, user);
        channel.subscribe(user, { x: 5, z: 5, halfX: 10, halfZ: 10 });
        const pid = channel.createEntity();
        const transform = channel.addSpatialComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: 5,
            y: 500,
            z: 5
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.ecsCreateEntities).toEqual([pid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(true);
        expect((_b = clientNetwork.store.get(transform.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(500);
        transform.x = 6;
        transform.y = 501;
        transform.z = 50;
        Transform.position(transform, 6, 501);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.ecsDeleteEntities).toEqual([pid]);
        expect((_d = clientNetwork.latestFrame) === null || _d === void 0 ? void 0 : _d.deleteEntities).toEqual([transform.nid]);
        expect(clientNetwork.store.ecsEntities.has(pid)).toBe(false);
        expect(clientNetwork.store.entities.has(transform.nid)).toBe(false);
    });
    it('updates manual spatial visibility when movement changes occupied cells', () => {
        var _a;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 100);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        const position = Entity.position;
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(100, 50, 110, 60));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'moving'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        entity.x = 150;
        entity.y = 6;
        position(entity, 150, 6);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(150);
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(true);
    });
    it('updates manual spatial visibility on the xz plane without treating y as horizontal', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 100, { plane: 'xz' });
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        instance.users.set(user.id, user);
        channel.subscribe(user, { x: 50, z: 50, halfX: 60, halfZ: 60 });
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 500,
            z: 5,
            label: 'xz-mover'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('xz-mover');
        expect((_b = clientNetwork.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(500);
        entity.x = 250;
        entity.y = 501;
        entity.z = 5;
        Entity.position(entity, 250, 501);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false);
    });
    it('creates and deletes manual spatial movers per user-visible cell set', () => {
        var _a, _b, _c;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 100);
        const Entity = channel.createEntityWriter(NType.Entity, context.getSchema(NType.Entity));
        const position = Entity.position;
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser, new AABB2D_1.AABB2D(50, 50, 40, 40));
        channel.subscribe(secondUser, new AABB2D_1.AABB2D(150, 50, 40, 40));
        const mover = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'mover'
        });
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 150,
            y: 6,
            label: 'anchor'
        });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        const moverNid = mover.nid;
        mover.x = 150;
        mover.y = 6;
        position(mover, 150, 6);
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect((_a = firstClient.latestFrame) === null || _a === void 0 ? void 0 : _a.deleteEntities).toEqual([moverNid]);
        expect(firstClient.store.entities.has(moverNid)).toBe(false);
        expect((_b = secondClient.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities.map(entity => entity.nid)).toContain(moverNid);
        expect((_c = secondClient.store.get(moverNid)) === null || _c === void 0 ? void 0 : _c.x).toBe(150);
    });
    it('can use shared create and delete fragments for synchronized all-visible channel deltas', () => {
        var _a, _b, _c, _d, _e, _f;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        instance.network.snapshotPerformanceEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new Channel_1.Channel(instance.localState);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser);
        channel.subscribe(secondUser);
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'initial'
        });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        const crate = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'crate'
        });
        const item = instance.attachChild(crate, {
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'item'
        });
        const crateNid = crate.nid;
        const itemNid = item.nid;
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(instance.network.sharedCreateFragments.size).toBe(1);
        expect((_a = firstClient.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities.map(entity => entity.nid)).toEqual([crateNid, itemNid]);
        expect((_b = secondClient.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities.map(entity => entity.nid)).toEqual([crateNid, itemNid]);
        expect((_c = firstClient.store.get(itemNid)) === null || _c === void 0 ? void 0 : _c.label).toBe('item');
        expect((_d = secondClient.store.get(itemNid)) === null || _d === void 0 ? void 0 : _d.label).toBe('item');
        channel.removeEntity(crate);
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(instance.network.sharedDeleteFragments.size).toBe(1);
        expect((_e = firstClient.latestFrame) === null || _e === void 0 ? void 0 : _e.deleteEntities).toEqual([itemNid, crateNid]);
        expect((_f = secondClient.latestFrame) === null || _f === void 0 ? void 0 : _f.deleteEntities).toEqual([itemNid, crateNid]);
        expect(firstClient.store.entities.has(crateNid)).toBe(false);
        expect(secondClient.store.entities.has(itemNid)).toBe(false);
        expect(instance.network.snapshotPerformance.sharedFragmentBuilds).toBe(4);
        expect(instance.network.snapshotPerformance.sharedFragmentHits).toBe(4);
    });
    it('keeps new all-visible channel subscribers on the full baseline create path', () => {
        var _a, _b;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const existingUser = createUser(instance);
        const newUser = createUser(instance);
        newUser.id = 2;
        const existingClient = createClientNetwork(context);
        const newClient = createClientNetwork(context);
        const channel = new Channel_1.Channel(instance.localState);
        instance.users.set(existingUser.id, existingUser);
        channel.subscribe(existingUser);
        const initial = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'initial'
        });
        instance.step();
        existingClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(existingUser)));
        existingClient.processNextFrame();
        instance.users.set(newUser.id, newUser);
        channel.subscribe(newUser);
        const added = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'added'
        });
        instance.step();
        existingClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(existingUser)));
        existingClient.processNextFrame();
        newClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(newUser)));
        newClient.processNextFrame();
        expect(instance.network.sharedCreateFragments.size).toBe(1);
        expect((_a = existingClient.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities.map(entity => entity.nid)).toEqual([added.nid]);
        expect((_b = newClient.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities.map(entity => entity.nid)).toEqual([initial.nid, added.nid]);
    });
    it('does not emit shared create or delete fragments for same-tick transient roots', () => {
        var _a, _b;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new Channel_1.Channel(instance.localState);
        instance.users.set(user.id, user);
        channel.subscribe(user);
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'initial'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        const transient = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 3,
            y: 4,
            label: 'transient'
        });
        channel.removeEntity(transient);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(instance.network.sharedCreateFragments.size).toBe(0);
        expect(instance.network.sharedDeleteFragments.size).toBe(0);
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities).toEqual([]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.deleteEntities).toEqual([]);
    });
    it('can use shared message fragments for channel broadcasts', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.snapshotPerformanceEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new Channel_1.Channel(instance.localState);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser);
        channel.subscribe(secondUser);
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        channel.addMessage({ ntype: NType.Message, text: 'broadcast' });
        firstUser.queueMessage({ ntype: NType.Message, text: 'private' });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(firstClient.messages).toEqual([
            { ntype: NType.Message, text: 'private' },
            { ntype: NType.Message, text: 'broadcast' }
        ]);
        expect(secondClient.messages).toEqual([
            { ntype: NType.Message, text: 'broadcast' }
        ]);
        expect(channel.broadcastMessages).toEqual([]);
        expect(instance.network.snapshotPerformance.sharedMessageFragmentBuilds).toBe(1);
        expect(instance.network.snapshotPerformance.sharedMessageFragmentHits).toBe(1);
        expect(instance.network.snapshotPerformance.messagesTotal).toBe(3);
    });
    it('can use reusable cell update fragments without userland updateEntity calls', () => {
        var _a, _b;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser, new AABB2D_1.AABB2D(10, 10, 5, 5));
        channel.subscribe(secondUser, new AABB2D_1.AABB2D(10, 10, 5, 5));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        entity.x = 11;
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(instance.network.sharedUpdateFragments.size).toBe(1);
        expect((_a = firstClient.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(11);
        expect((_b = secondClient.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.x).toBe(11);
    });
    it('uses the xz plane for SpatialChannel2D visibility without copying z into y', () => {
        var _a, _b;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50, { plane: 'xz' });
        instance.users.set(user.id, user);
        channel.subscribe(user, { x: 10, z: 10, halfX: 20, halfZ: 20 });
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 500,
            z: 6,
            label: 'xz-visible'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('xz-visible');
        expect((_b = clientNetwork.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(500);
        entity.z = 200;
        channel.updateEntity(entity);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false);
    });
    it('uses true 3D cells for SpatialChannel3D visibility', () => {
        var _a;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel3D_1.SpatialChannel3D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB3D_1.AABB3D(10, 10, 10, 20, 20, 20));
        const visible = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'visible-3d'
        });
        const above = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 200,
            z: 7,
            label: 'above'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(visible.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('visible-3d');
        expect(clientNetwork.store.entities.has(above.nid)).toBe(false);
    });
    it('uses coarse circle cells for SpatialChannel2D visibility', () => {
        var _a;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, { x: 0, y: 0, radius: 25 });
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 0,
            label: 'circle-visible'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('circle-visible');
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0']);
        entity.x = 80;
        channel.updateEntity(entity);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false);
        expect(channel.getVisibleCellKeys(user.id)).toEqual([]);
    });
    it('uses coarse sphere cells for SpatialChannel3D visibility', () => {
        var _a;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel3D_1.SpatialChannel3D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, { x: 0, y: 0, z: 0, radius: 25 });
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 0,
            z: 0,
            label: 'sphere-visible'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('sphere-visible');
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0:0']);
        entity.x = 80;
        channel.updateEntity(entity);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false);
        expect(channel.getVisibleCellKeys(user.id)).toEqual([]);
    });
    it('updates SpatialChannel3D visibility when only vertical position changes cells', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel3D_1.SpatialChannel3D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB3D_1.AABB3D(10, 10, 10, 20, 20, 20));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            z: 7,
            label: 'vertical'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(true);
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0:0']);
        entity.y = 200;
        channel.updateEntity(entity);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.entities.has(entity.nid)).toBe(false);
        expect(channel.getVisibleCellKeys(user.id)).toEqual([]);
    });
    it('spatially culls SpatialChannel3D messages vertically', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new SpatialChannel3D_1.SpatialChannel3D(instance.localState, 50);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser, new AABB3D_1.AABB3D(10, 10, 10, 20, 20, 20));
        channel.subscribe(secondUser, new AABB3D_1.AABB3D(10, 200, 10, 20, 20, 20));
        channel.addMessage({ ntype: NType.Message, text: 'near-3d', x: 10, y: 10, z: 10 });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(firstClient.messages).toEqual([{ ntype: NType.Message, text: 'near-3d' }]);
        expect(secondClient.messages).toEqual([]);
    });
    it('records explicit dirty hints without requiring them for implicit SpatialChannel2D updates', () => {
        var _a;
        const context = createGroupedContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(10, 10, 5, 5));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        entity.x = 11;
        expect(instance.markDirty(entity)).toBe(true);
        expect(instance.localState.dirtyNids.has(entity.nid)).toBe(true);
        expect(channel.getDirtyCellKeys()).toEqual(['0:0']);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(11);
        expect(instance.localState.dirtyNids.size).toBe(0);
        expect(channel.getDirtyCellKeys()).toEqual([]);
    });
    it('can reuse cell create and delete fragments when users enter and leave the same cell', () => {
        var _a, _b;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser, new AABB2D_1.AABB2D(200, 200, 5, 5));
        channel.subscribe(secondUser, new AABB2D_1.AABB2D(200, 200, 5, 5));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'door'
        });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        channel.updateView(firstUser, new AABB2D_1.AABB2D(10, 10, 5, 5));
        channel.updateView(secondUser, new AABB2D_1.AABB2D(10, 10, 5, 5));
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(instance.network.sharedCreateFragments.size).toBe(1);
        expect((_a = firstClient.store.get(entity.nid)) === null || _a === void 0 ? void 0 : _a.label).toBe('door');
        expect((_b = secondClient.store.get(entity.nid)) === null || _b === void 0 ? void 0 : _b.label).toBe('door');
        channel.updateView(firstUser, new AABB2D_1.AABB2D(200, 200, 5, 5));
        channel.updateView(secondUser, new AABB2D_1.AABB2D(200, 200, 5, 5));
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(instance.network.sharedDeleteFragments.size).toBe(1);
        expect(firstClient.store.entities.has(entity.nid)).toBe(false);
        expect(secondClient.store.entities.has(entity.nid)).toBe(false);
    });
    it('keeps SpatialChannel2D visible cell keys cached for movement between populated cells', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 100);
        channel.subscribe(user, new AABB2D_1.AABB2D(100, 50, 150, 75));
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 10,
            label: 'first'
        });
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 20,
            y: 10,
            label: 'second'
        });
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 120,
            y: 10,
            label: 'third'
        });
        const keys = channel.getVisibleCellKeys(user.id);
        first.x = 130;
        channel.updateEntity(first);
        expect(channel.getVisibleCellKeys(user.id)).toBe(keys);
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0', '1:0']);
    });
    it('rebuilds SpatialChannel2D visible cell keys when movement changes occupied cells', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 100);
        channel.subscribe(user, new AABB2D_1.AABB2D(100, 50, 150, 75));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 10,
            y: 10,
            label: 'first'
        });
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['0:0']);
        entity.x = 130;
        channel.updateEntity(entity);
        expect(channel.getVisibleCellKeys(user.id)).toEqual(['1:0']);
    });
    it('spatially culls SpatialChannel2D messages instead of broadcasting them', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser, new AABB2D_1.AABB2D(10, 10, 5, 5));
        channel.subscribe(secondUser, new AABB2D_1.AABB2D(200, 200, 5, 5));
        channel.addMessage({ ntype: NType.Message, text: 'near', x: 10, y: 10 });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect(firstClient.messages).toEqual([{ ntype: NType.Message, text: 'near' }]);
        expect(secondClient.messages).toEqual([]);
    });
    it('keeps same-cell SpatialChannel2D creates on the normal create path', () => {
        var _a, _b;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(10, 10, 5, 5));
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'first'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        const second = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'second'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.createEntities.map(entity => entity.nid)).toEqual([second.nid]);
        expect((_b = clientNetwork.store.get(second.nid)) === null || _b === void 0 ? void 0 : _b.label).toBe('second');
    });
    it('keeps same-cell SpatialChannel2D removes on the normal delete path', () => {
        var _a, _b;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(10, 10, 5, 5));
        const first = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'first'
        });
        const second = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'second'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        const firstNid = first.nid;
        channel.removeEntity(first);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.deleteEntities).toEqual([firstNid]);
        expect(clientNetwork.store.entities.has(firstNid)).toBe(false);
        expect((_b = clientNetwork.store.get(second.nid)) === null || _b === void 0 ? void 0 : _b.label).toBe('second');
    });
    it('updates SpatialChannel2D visibility correctly when an entity moves between cells', () => {
        var _a, _b, _c;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const firstUser = createUser(instance);
        const secondUser = createUser(instance);
        secondUser.id = 2;
        const firstClient = createClientNetwork(context);
        const secondClient = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(firstUser.id, firstUser);
        instance.users.set(secondUser.id, secondUser);
        channel.subscribe(firstUser, new AABB2D_1.AABB2D(10, 10, 5, 5));
        channel.subscribe(secondUser, new AABB2D_1.AABB2D(60, 10, 5, 5));
        const entity = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'moving'
        });
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        const nid = entity.nid;
        entity.x = 60;
        channel.updateEntity(entity);
        instance.step();
        firstClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(firstUser)));
        firstClient.processNextFrame();
        secondClient.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(secondUser)));
        secondClient.processNextFrame();
        expect((_a = firstClient.latestFrame) === null || _a === void 0 ? void 0 : _a.deleteEntities).toEqual([nid]);
        expect(firstClient.store.entities.has(nid)).toBe(false);
        expect((_b = secondClient.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities.map(created => created.nid)).toEqual([nid]);
        expect((_c = secondClient.store.get(nid)) === null || _c === void 0 ? void 0 : _c.x).toBe(60);
    });
    it('orders SpatialChannel2D leave-cell tree deletes from child to parent', () => {
        var _a;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        instance.network.sharedUpdateFragmentsEnabled = true;
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 50);
        instance.users.set(user.id, user);
        channel.subscribe(user, new AABB2D_1.AABB2D(10, 10, 5, 5));
        const parent = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'parent'
        });
        const child = instance.attachChild(parent, {
            nid: 0,
            ntype: NType.Entity,
            x: 7,
            y: 8,
            label: 'child'
        });
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        const parentNid = parent.nid;
        const childNid = child.nid;
        channel.updateView(user, new AABB2D_1.AABB2D(200, 200, 5, 5));
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.deleteEntities).toEqual([childNid, parentNid]);
        expect(clientNetwork.store.entities.has(parentNid)).toBe(false);
        expect(clientNetwork.store.entities.has(childNid)).toBe(false);
    });
    it('reruns snapshot writes with binary debug context after a write failure', () => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new Channel_1.Channel(instance.localState);
        instance.network.debugBinaryWrites = true;
        channel.subscribe(user);
        channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: Symbol('bad'),
            y: 6,
            label: 'bad'
        });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        try {
            (0, createSnapshotBuffer_1.default)(user, instance);
            throw new Error('Expected snapshot write to fail.');
        }
        catch (err) {
            expect(err).toBeInstanceOf(BinaryDebugError_1.BinaryDebugError);
            expect(err.context).toEqual(expect.objectContaining({
                phase: 'write',
                section: 'CreateEntities',
                index: 0,
                prop: 'x',
                propKey: 0,
                binaryType: Binary_1.Binary.Float64
            }));
            expect(err.message).toContain('CreateEntities');
            expect(err.message).toContain('prop: "x"');
        }
    });
    it('reruns ECS component snapshot writes with binary debug context after a write failure', () => {
        const context = createEcsContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const channel = new EcsChannel_1.EcsChannel(instance.localState);
        instance.network.debugBinaryWrites = true;
        channel.subscribe(user);
        const pid = channel.createEntity();
        channel.addComponent(pid, {
            nid: 0,
            ntype: NType.Transform,
            x: Symbol('bad'),
            y: 6
        });
        try {
            (0, createSnapshotBuffer_1.default)(user, instance);
            throw new Error('Expected ECS snapshot write to fail.');
        }
        catch (err) {
            expect(err).toBeInstanceOf(BinaryDebugError_1.BinaryDebugError);
            expect(err.context).toEqual(expect.objectContaining({
                phase: 'write',
                section: 'EcsCreateComponents',
                index: 0,
                prop: 'x',
                propKey: 0,
                binaryType: Binary_1.Binary.Float64
            }));
            expect(err.message).toContain('EcsCreateComponents');
            expect(err.message).toContain('prop: "x"');
        }
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
        const first = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
        expect(first.responses).toHaveLength(255);
        expect(first.responses[0].requestId).toBe(1);
        expect(first.responses[254].requestId).toBe(255);
        (0, createSnapshotBuffer_1.commitSnapshotPlan)(user, first);
        expect(user.responseQueue).toHaveLength(1);
        expect(user.responseQueue[0].requestId).toBe(256);
        const second = (0, createSnapshotBuffer_1.collectSnapshotPlan)(user, instance);
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
        (0, createSnapshotBuffer_1.default)(user, instance);
        expect(user.responseQueue).toHaveLength(1);
        expect(onResponseBacklog).toHaveBeenCalledWith({
            user,
            queued: 256,
            sent: 255,
            remaining: 1,
            tick: 7
        });
        (0, createSnapshotBuffer_1.default)(user, instance);
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
        const buffer = (0, createSnapshotBuffer_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(buffer));
        clientNetwork.processNextFrame();
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
        const createBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(createBuffer));
        clientNetwork.processNextFrame();
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
        const updateBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(updateBuffer));
        clientNetwork.processNextFrame();
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities).toEqual([]);
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.updateEntities).toEqual([
            { nid, prop: 'x', previous: 5, value: 11 }
        ]);
        expect((_d = clientNetwork.store.get(nid)) === null || _d === void 0 ? void 0 : _d.x).toBe(11);
        channel.removeEntity(entity);
        instance.tick = 3;
        instance.cache.createCachesForTick(instance.tick);
        const deleteBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(deleteBuffer));
        clientNetwork.processNextFrame();
        expect((_e = clientNetwork.latestFrame) === null || _e === void 0 ? void 0 : _e.deleteEntities).toEqual([nid]);
        expect(clientNetwork.store.entities.has(nid)).toBe(false);
        expect(clientNetwork.entityNTypes.has(nid)).toBe(false);
    });
    it('sends channel headers before normal channel entities and applies header updates', () => {
        var _a, _b, _c, _d, _e;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const header = {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        };
        const channel = new Channel_1.Channel(instance.localState, { header });
        const clientNetwork = createClientNetwork(context);
        channel.subscribe(user);
        const item = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'item'
        });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        const createBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(createBuffer));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.channelHeaderCreates).toEqual([
            {
                channelId: channel.nid,
                version: 0,
                header: { nid: header.nid, ntype: NType.Entity, x: 0, y: 0, label: 'inventory' }
            }
        ]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.createEntities).toEqual([
            { nid: item.nid, ntype: NType.Entity, x: 5, y: 6, label: 'item' }
        ]);
        expect(clientNetwork.store.getChannelHeader(channel.nid)).toEqual({
            nid: header.nid,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        });
        header.label = 'renamed';
        channel.markHeaderDirty();
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        const updateBuffer = (0, createSnapshotBuffer_1.default)(user, instance);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(updateBuffer));
        clientNetwork.processNextFrame();
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.channelHeaderUpdates).toHaveLength(1);
        expect((_d = clientNetwork.store.getChannelHeader(channel.nid)) === null || _d === void 0 ? void 0 : _d.label).toBe('renamed');
        expect((_e = clientNetwork.latestFrame) === null || _e === void 0 ? void 0 : _e.createEntities).toEqual([]);
    });
    it('sends a newly subscribed headered channel alongside an existing world channel', () => {
        var _a, _b, _c;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const world = new Channel_1.Channel(instance.localState, { label: 'world' });
        const inventoryHeader = {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        };
        const inventory = new Channel_1.Channel(instance.localState, {
            label: 'inventory',
            header: inventoryHeader
        });
        world.subscribe(user);
        const player = world.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 1,
            y: 2,
            label: 'player'
        });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.get(player.nid)).toBeDefined();
        inventory.subscribe(user);
        const item = inventory.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'item'
        });
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.channelHeaderCreates.map(create => create.channelId)).toEqual([inventory.nid]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.channelEntityCreates).toEqual([
            { nid: item.nid, channelId: inventory.nid }
        ]);
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.createEntities).toEqual([
            { nid: item.nid, ntype: NType.Entity, x: 5, y: 6, label: 'item' }
        ]);
        expect(clientNetwork.store.getChannelHeader(item.nid)).toEqual({
            nid: inventoryHeader.nid,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        });
    });
    it('closes a known headered channel without sending each contained entity delete', () => {
        var _a, _b, _c;
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const header = {
            nid: 0,
            ntype: NType.Entity,
            x: 0,
            y: 0,
            label: 'inventory'
        };
        const channel = new Channel_1.Channel(instance.localState, { header });
        channel.subscribe(user);
        const item = channel.addEntity({
            nid: 0,
            ntype: NType.Entity,
            x: 5,
            y: 6,
            label: 'item'
        });
        instance.tick = 1;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        clientNetwork.processNextFrame();
        expect(clientNetwork.store.get(item.nid)).toBeDefined();
        const itemNid = item.nid;
        channel.unsubscribe(user);
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        clientNetwork.processNextFrame();
        expect((_a = clientNetwork.latestFrame) === null || _a === void 0 ? void 0 : _a.channelHeaderDeletes).toEqual([
            {
                channelId: channel.nid,
                header: { nid: header.nid, ntype: NType.Entity, x: 0, y: 0, label: 'inventory' }
            }
        ]);
        expect((_b = clientNetwork.latestFrame) === null || _b === void 0 ? void 0 : _b.deleteEntities).toEqual([]);
        expect((_c = clientNetwork.latestFrame) === null || _c === void 0 ? void 0 : _c.closedChannels).toEqual([
            {
                channelId: channel.nid,
                header: { nid: header.nid, ntype: NType.Entity, x: 0, y: 0, label: 'inventory' },
                entityNids: [itemNid]
            }
        ]);
        expect(clientNetwork.store.get(itemNid)).toBeUndefined();
        expect(clientNetwork.store.getChannelHeader(channel.nid)).toBeUndefined();
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
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
        entity.x = 3;
        instance.tick = 2;
        instance.cache.createCachesForTick(instance.tick);
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader((0, createSnapshotBuffer_1.default)(user, instance)));
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
