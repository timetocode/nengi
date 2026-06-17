"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const ClientNetwork_1 = require("../../client/ClientNetwork");
const EcsChannel_1 = require("../../server/channel/EcsChannel");
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
function createScenario() {
    const context = createContext();
    const instance = new Instance_1.Instance(context);
    const channel = new EcsChannel_1.EcsChannel(instance.localState, { name: 'ecs-correctness' });
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform));
    const Body = channel.createComponentWriter(NType.Body, context.getSchema(NType.Body));
    const users = [createUser(instance, 1), createUser(instance, 2)];
    const clients = [createClientNetwork(context), createClientNetwork(context)];
    channel.subscribe(users[0]);
    channel.subscribe(users[1]);
    return { context, instance, channel, Transform, Body, users, clients, records: [] };
}
function addRoot(scenario, x, y, hp) {
    const pid = scenario.channel.createEntity();
    const transform = scenario.channel.addComponent(pid, { nid: 0, ntype: NType.Transform, x, y });
    const body = scenario.channel.addComponent(pid, { nid: 0, ntype: NType.Body, hp });
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
function assertClientMatchesOracle(scenario, client) {
    var _a, _b, _c;
    const expectedRoots = [];
    const expectedComponents = [];
    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i];
        if (!record.alive) {
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
}
function stepAndAssert(scenario) {
    scenario.instance.step();
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])));
        scenario.clients[i].processNextFrame();
        assertClientMatchesOracle(scenario, scenario.clients[i]);
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
        expect(scenario.clients[i].drainFrames()).toHaveLength(send.mock.calls.length - startCounts[i]);
        assertClientMatchesOracle(scenario, scenario.clients[i]);
    }
}
describe('EcsChannel snapshot correctness', () => {
    it('keeps all-visible ECS clients synchronized', () => {
        const scenario = createScenario();
        const a = addRoot(scenario, 5, 5, 100);
        const b = addRoot(scenario, 100, 100, 200);
        stepAndAssert(scenario);
        moveRoot(scenario, a, 6, 7);
        damageRoot(scenario, b, 180);
        stepAndAssert(scenario);
        const c = addRoot(scenario, 50, 60, 300);
        damageRoot(scenario, c, 275);
        stepAndAssert(scenario);
        removeRoot(scenario, b);
        stepAndAssert(scenario);
    });
    it('stays synchronized when ECS snapshots are drained later', () => {
        const scenario = createScenario();
        const a = addRoot(scenario, 5, 5, 100);
        const b = addRoot(scenario, 100, 100, 200);
        stepAndAssert(scenario);
        const startCounts = sentCounts(scenario);
        moveRoot(scenario, a, 10, 10);
        scenario.instance.step();
        damageRoot(scenario, b, 150);
        scenario.instance.step();
        removeRoot(scenario, a);
        addRoot(scenario, 200, 200, 300);
        scenario.instance.step();
        readAndDrainNewFrames(scenario, startCounts);
    });
});
