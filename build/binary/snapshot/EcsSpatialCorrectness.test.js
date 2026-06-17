"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const ClientNetwork_1 = require("../../client/ClientNetwork");
const AABB2D_1 = require("../../server/channel/AABB2D");
const AABB3D_1 = require("../../server/channel/AABB3D");
const EcsSpatialChannel2D_1 = require("../../server/channel/EcsSpatialChannel2D");
const EcsSpatialChannel3D_1 = require("../../server/channel/EcsSpatialChannel3D");
const Instance_1 = require("../../server/Instance");
const User_1 = require("../../server/User");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
var NType;
(function (NType) {
    NType[NType["Body"] = 1] = "Body";
    NType[NType["Transform"] = 2] = "Transform";
})(NType || (NType = {}));
function createContext() {
    const context = new Context_1.Context();
    context.register(NType.Transform, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    }));
    context.register(NType.Body, (0, defineSchema_1.defineEntitySchema)({
        hp: Binary_1.Binary.UInt16
    }));
    return context;
}
function createContext3D() {
    const context = new Context_1.Context();
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
    context.register(NType.Body, (0, defineSchema_1.defineEntitySchema)({
        hp: Binary_1.Binary.UInt16
    }));
    return context;
}
function createUser(instance, id) {
    const user = new User_1.User(undefined, {
        binary: BufferBinary_1.testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    });
    user.id = id;
    user.instance = instance;
    instance.users.set(user.id, user);
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
function sorted(values) {
    return Array.from(values).sort((a, b) => a - b);
}
function cellCoord(value, cellSize) {
    return Math.floor(value / cellSize);
}
function cellCoordForEnd(value, cellSize) {
    return Math.ceil(value / cellSize) - 1;
}
function isVisibleByCoarseCell(transform, view, cellSize) {
    const cellX = cellCoord(transform.x, cellSize);
    const cellY = cellCoord(transform.y, cellSize);
    return cellX >= cellCoord(view.x - view.halfWidth, cellSize) &&
        cellX <= cellCoordForEnd(view.x + view.halfWidth, cellSize) &&
        cellY >= cellCoord(view.y - view.halfHeight, cellSize) &&
        cellY <= cellCoordForEnd(view.y + view.halfHeight, cellSize);
}
function isVisibleByCoarseCell3D(transform, view, cellSize) {
    const cellX = cellCoord(transform.x, cellSize);
    const cellY = cellCoord(transform.y, cellSize);
    const cellZ = cellCoord(transform.z, cellSize);
    return cellX >= cellCoord(view.x - view.halfWidth, cellSize) &&
        cellX <= cellCoordForEnd(view.x + view.halfWidth, cellSize) &&
        cellY >= cellCoord(view.y - view.halfHeight, cellSize) &&
        cellY <= cellCoordForEnd(view.y + view.halfHeight, cellSize) &&
        cellZ >= cellCoord(view.z - view.halfDepth, cellSize) &&
        cellZ <= cellCoordForEnd(view.z + view.halfDepth, cellSize);
}
function assertClientMatchesOracle(scenario, clientIndex, label) {
    var _a, _b, _c;
    const client = scenario.clients[clientIndex];
    const view = scenario.views[clientIndex];
    const expectedRoots = [];
    const expectedComponents = [];
    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i];
        if (!record.alive || !isVisibleByCoarseCell(record.transform, view, 10)) {
            continue;
        }
        expectedRoots.push(record.pid);
        expectedComponents.push(record.transform.nid, record.body.nid);
        expect((_a = client.store.get(record.transform.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(record.transform.x);
        expect((_b = client.store.get(record.transform.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(record.transform.y);
        expect((_c = client.store.get(record.body.nid)) === null || _c === void 0 ? void 0 : _c.hp).toBe(record.body.hp);
    }
    expect(sorted(client.store.ecsEntities)).toEqual(sorted(expectedRoots));
    expect(sorted(client.store.entities.keys())).toEqual(sorted(expectedComponents));
    if (client.latestFrame && client.latestFrame.channels.length > 0) {
        expect(client.latestFrame.channels.every(channel => channel.channelId === scenario.channel.nid)).toBe(true);
    }
}
function stepAndAssert(scenario, label) {
    scenario.instance.step();
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])));
        scenario.clients[i].processNextFrame();
        assertClientMatchesOracle(scenario, i, `${label}:user${i + 1}`);
    }
}
function assertClientMatches3DOracle(scenario, clientIndex) {
    var _a, _b, _c, _d;
    const client = scenario.clients[clientIndex];
    const view = scenario.views[clientIndex];
    const expectedRoots = [];
    const expectedComponents = [];
    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i];
        if (!record.alive || !isVisibleByCoarseCell3D(record.transform, view, 10)) {
            continue;
        }
        expectedRoots.push(record.pid);
        expectedComponents.push(record.transform.nid, record.body.nid);
        expect((_a = client.store.get(record.transform.nid)) === null || _a === void 0 ? void 0 : _a.x).toBe(record.transform.x);
        expect((_b = client.store.get(record.transform.nid)) === null || _b === void 0 ? void 0 : _b.y).toBe(record.transform.y);
        expect((_c = client.store.get(record.transform.nid)) === null || _c === void 0 ? void 0 : _c.z).toBe(record.transform.z);
        expect((_d = client.store.get(record.body.nid)) === null || _d === void 0 ? void 0 : _d.hp).toBe(record.body.hp);
    }
    expect(sorted(client.store.ecsEntities)).toEqual(sorted(expectedRoots));
    expect(sorted(client.store.entities.keys())).toEqual(sorted(expectedComponents));
}
function stepAndAssert3D(scenario) {
    scenario.instance.step();
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])));
        scenario.clients[i].processNextFrame();
        assertClientMatches3DOracle(scenario, i);
    }
}
function sentCounts(scenario) {
    return scenario.users.map(user => user.networkAdapter.send.mock.calls.length);
}
function readAndDrainNewFrames(scenario, startCounts) {
    for (let i = 0; i < scenario.users.length; i++) {
        const send = scenario.users[i].networkAdapter.send;
        for (let j = startCounts[i]; j < send.mock.calls.length; j++) {
            scenario.clients[i].readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(send.mock.calls[j][1]));
        }
        const frames = scenario.clients[i].drainFrames();
        expect(frames.length).toBe(send.mock.calls.length - startCounts[i]);
        assertClientMatchesOracle(scenario, i, `queued:user${i + 1}`);
    }
}
function addRoot(scenario, x, y, hp) {
    const pid = scenario.channel.createEntity();
    const transform = scenario.channel.addSpatialComponent(pid, {
        nid: 0,
        ntype: NType.Transform,
        x,
        y
    });
    const body = scenario.channel.addComponent(pid, {
        nid: 0,
        ntype: NType.Body,
        hp
    });
    const record = { pid, transform, body, alive: true };
    scenario.records.push(record);
    return record;
}
function addRoot3D(scenario, x, y, z, hp) {
    const pid = scenario.channel.createEntity();
    const transform = scenario.channel.addSpatialComponent(pid, {
        nid: 0,
        ntype: NType.Transform,
        x,
        y,
        z
    });
    const body = scenario.channel.addComponent(pid, {
        nid: 0,
        ntype: NType.Body,
        hp
    });
    const record = { pid, transform, body, alive: true };
    scenario.records.push(record);
    return record;
}
function moveRoot(scenario, record, x, y) {
    record.transform.x = x;
    record.transform.y = y;
    scenario.Transform.position(record.transform, x, y);
}
function damageRoot(scenario, record, hp) {
    record.body.hp = hp;
    scenario.Body.props.hp(record.body, hp);
}
function removeRoot(scenario, record) {
    scenario.channel.removeEntity(record.pid);
    record.alive = false;
}
function moveRoot3D(scenario, record, x, y, z) {
    record.transform.x = x;
    record.transform.y = y;
    record.transform.z = z;
    scenario.Transform.position(record.transform, x, y, z);
}
function damageRoot3D(scenario, record, hp) {
    record.body.hp = hp;
    scenario.Body.props.hp(record.body, hp);
}
function removeRoot3D(scenario, record) {
    scenario.channel.removeEntity(record.pid);
    record.alive = false;
}
function createRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}
function createScenario(createChannel) {
    const context = createContext();
    const instance = new Instance_1.Instance(context);
    const channel = createChannel(instance);
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
    const Body = channel.createComponentWriter(NType.Body, context.getSchema(NType.Body));
    const users = [createUser(instance, 1), createUser(instance, 2)];
    const clients = [createClientNetwork(context), createClientNetwork(context)];
    const views = [
        new AABB2D_1.AABB2D(5, 5, 10, 10),
        new AABB2D_1.AABB2D(105, 5, 10, 10)
    ];
    channel.subscribe(users[0], views[0]);
    channel.subscribe(users[1], views[1]);
    return { context, instance, channel, Transform, Body, users, clients, views, records: [] };
}
function createScenario3D() {
    const context = createContext3D();
    const instance = new Instance_1.Instance(context);
    const channel = new EcsSpatialChannel3D_1.EcsSpatialChannel3D(instance.localState, 10, { name: 'ecs-spatial-3d-correctness' });
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
    const Body = channel.createComponentWriter(NType.Body, context.getSchema(NType.Body));
    const users = [createUser(instance, 1), createUser(instance, 2)];
    const clients = [createClientNetwork(context), createClientNetwork(context)];
    const views = [
        new AABB3D_1.AABB3D(5, 5, 5, 10, 10, 10),
        new AABB3D_1.AABB3D(105, 5, 5, 10, 10, 10)
    ];
    channel.subscribe(users[0], views[0]);
    channel.subscribe(users[1], views[1]);
    return { context, instance, channel, Transform, Body, users, clients, views, records: [] };
}
function runScriptedCorrectnessScenario(createChannel) {
    const scenario = createScenario(createChannel);
    const a = addRoot(scenario, 5, 5, 100);
    const b = addRoot(scenario, 105, 5, 200);
    const c = addRoot(scenario, 500, 500, 300);
    stepAndAssert(scenario, 'initial creates');
    scenario.views[0].x = 105;
    scenario.channel.updateView(scenario.users[0], scenario.views[0]);
    stepAndAssert(scenario, 'viewer moves toward entity');
    moveRoot(scenario, c, 105, 5);
    damageRoot(scenario, c, 275);
    stepAndAssert(scenario, 'entity moves into view with update');
    scenario.views[1].x = 500;
    scenario.channel.updateView(scenario.users[1], scenario.views[1]);
    stepAndAssert(scenario, 'viewer moves away');
    moveRoot(scenario, b, 500, 500);
    stepAndAssert(scenario, 'entity moves away');
    const d = addRoot(scenario, 105, 5, 400);
    damageRoot(scenario, d, 390);
    stepAndAssert(scenario, 'spawn and update inside view');
    const e = addRoot(scenario, 900, 900, 500);
    stepAndAssert(scenario, 'spawn outside view');
    removeRoot(scenario, c);
    stepAndAssert(scenario, 'remove visible entity');
    removeRoot(scenario, e);
    stepAndAssert(scenario, 'remove invisible entity');
    moveRoot(scenario, a, 106, 6);
    damageRoot(scenario, a, 90);
    stepAndAssert(scenario, 'previously invisible entity re-enters');
}
function runDeterministicFuzzScenario(createChannel) {
    const scenario = createScenario(createChannel);
    const random = createRandom(0xdecafbad);
    for (let i = 0; i < 24; i++) {
        addRoot(scenario, Math.floor(random() * 260) - 40, Math.floor(random() * 180) - 40, 1000 + i);
    }
    stepAndAssert(scenario, 'fuzz initial');
    for (let tick = 1; tick <= 80; tick++) {
        scenario.views[0].x = 20 + ((tick * 9) % 180);
        scenario.views[0].y = 10 + ((tick * 5) % 120);
        scenario.views[1].x = 190 - ((tick * 7) % 180);
        scenario.views[1].y = 110 - ((tick * 3) % 120);
        scenario.channel.updateView(scenario.users[0], scenario.views[0]);
        scenario.channel.updateView(scenario.users[1], scenario.views[1]);
        for (let i = 0; i < scenario.records.length; i++) {
            const record = scenario.records[i];
            if (!record.alive) {
                continue;
            }
            if (random() < 0.35) {
                const x = Math.floor(random() * 300) - 50;
                const y = Math.floor(random() * 220) - 50;
                moveRoot(scenario, record, x, y);
            }
            if (random() < 0.45) {
                damageRoot(scenario, record, Math.floor(random() * 5000));
            }
        }
        if (tick % 6 === 0) {
            const x = tick % 12 === 0 ? scenario.views[0].x : Math.floor(random() * 360) - 80;
            const y = tick % 12 === 0 ? scenario.views[0].y : Math.floor(random() * 260) - 80;
            const record = addRoot(scenario, x, y, 3000 + tick);
            if (tick % 12 === 0) {
                damageRoot(scenario, record, 2900 + tick);
            }
        }
        if (tick % 9 === 0) {
            const alive = scenario.records.filter(record => record.alive);
            if (alive.length > 0) {
                removeRoot(scenario, alive[Math.floor(random() * alive.length)]);
            }
        }
        stepAndAssert(scenario, `fuzz tick ${tick}`);
    }
}
function runQueuedSnapshotScenario(createChannel) {
    const scenario = createScenario(createChannel);
    const a = addRoot(scenario, 5, 5, 100);
    const b = addRoot(scenario, 500, 500, 200);
    stepAndAssert(scenario, 'queued initial');
    const startCounts = sentCounts(scenario);
    moveRoot(scenario, a, 500, 500);
    scenario.instance.step();
    moveRoot(scenario, b, 105, 5);
    damageRoot(scenario, b, 180);
    scenario.instance.step();
    const c = addRoot(scenario, scenario.views[0].x, scenario.views[0].y, 300);
    damageRoot(scenario, c, 275);
    removeRoot(scenario, a);
    scenario.instance.step();
    scenario.views[0].x = 105;
    scenario.views[0].y = 5;
    scenario.channel.updateView(scenario.users[0], scenario.views[0]);
    scenario.instance.step();
    readAndDrainNewFrames(scenario, startCounts);
}
function run3DCorrectnessScenario() {
    const scenario = createScenario3D();
    const a = addRoot3D(scenario, 5, 5, 5, 100);
    const b = addRoot3D(scenario, 105, 5, 5, 200);
    const c = addRoot3D(scenario, 500, 500, 500, 300);
    stepAndAssert3D(scenario);
    scenario.views[0].x = 105;
    scenario.channel.updateView(scenario.users[0], scenario.views[0]);
    stepAndAssert3D(scenario);
    moveRoot3D(scenario, c, 105, 5, 5);
    damageRoot3D(scenario, c, 275);
    stepAndAssert3D(scenario);
    scenario.views[1].z = 500;
    scenario.channel.updateView(scenario.users[1], scenario.views[1]);
    stepAndAssert3D(scenario);
    moveRoot3D(scenario, b, 500, 500, 500);
    stepAndAssert3D(scenario);
    const d = addRoot3D(scenario, 105, 5, 5, 400);
    damageRoot3D(scenario, d, 390);
    stepAndAssert3D(scenario);
    const e = addRoot3D(scenario, 900, 900, 900, 500);
    stepAndAssert3D(scenario);
    removeRoot3D(scenario, c);
    stepAndAssert3D(scenario);
    removeRoot3D(scenario, e);
    stepAndAssert3D(scenario);
    moveRoot3D(scenario, a, 106, 6, 6);
    damageRoot3D(scenario, a, 90);
    stepAndAssert3D(scenario);
}
describe('ECS spatial snapshot correctness', () => {
    it('keeps EcsSpatialChannel2D clients synchronized with the cell-coarse oracle', () => {
        runScriptedCorrectnessScenario(instance => new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10, { name: 'optimized-correctness' }));
    });
    it('keeps EcsSpatialChannel2D synchronized during deterministic spatial churn', () => {
        runDeterministicFuzzScenario(instance => new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10, { name: 'optimized-fuzz' }));
    });
    it('keeps EcsSpatialChannel2D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(instance => new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10, { name: 'optimized-queued' }));
    });
    it('keeps EcsSpatialChannel3D clients synchronized with the cell-coarse oracle', () => {
        run3DCorrectnessScenario();
    });
});
