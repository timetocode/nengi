"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const ClientNetwork_1 = require("../../client/ClientNetwork");
const Instance_1 = require("../Instance");
const User_1 = require("../User");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
const Channel_1 = require("./Channel");
const ManualChannel_1 = require("./ManualChannel");
const SpatialChannel2D_1 = require("./SpatialChannel2D");
const SpatialChannel3D_1 = require("./SpatialChannel3D");
const ManualSpatialChannel2D_1 = require("./ManualSpatialChannel2D");
const ManualSpatialChannel3D_1 = require("./ManualSpatialChannel3D");
const EcsChannel_1 = require("./EcsChannel");
const EcsSpatialChannel2D_1 = require("./EcsSpatialChannel2D");
const EcsSpatialChannel3D_1 = require("./EcsSpatialChannel3D");
var NType;
(function (NType) {
    NType[NType["Entity"] = 1] = "Entity";
    NType[NType["Component"] = 2] = "Component";
})(NType || (NType = {}));
function createContext() {
    const context = new Context_1.Context();
    const schema = (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64,
        z: Binary_1.Binary.Float64,
        label: Binary_1.Binary.String
    });
    context.register(NType.Entity, schema);
    context.register(NType.Component, schema);
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
function createEntity(ntype = NType.Entity) {
    return {
        nid: 0,
        ntype,
        x: 1,
        y: 2,
        z: 3,
        label: 'created'
    };
}
describe('channel headers', () => {
    const cases = [
        {
            name: 'Channel',
            setup(instance, user, header) {
                const channel = new Channel_1.Channel(instance.localState, { header });
                channel.subscribe(user);
                const entity = channel.addEntity(createEntity());
                return [entity.nid];
            }
        },
        {
            name: 'ManualChannel',
            setup(instance, user, header) {
                const channel = new ManualChannel_1.ManualChannel(instance.localState, { header });
                channel.subscribe(user);
                const entity = channel.addEntity(createEntity());
                return [entity.nid];
            }
        },
        {
            name: 'SpatialChannel2D',
            setup(instance, user, header) {
                const channel = new SpatialChannel2D_1.SpatialChannel2D(instance.localState, 10, { header });
                channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 });
                const entity = channel.addEntity(createEntity());
                return [entity.nid];
            }
        },
        {
            name: 'SpatialChannel3D',
            setup(instance, user, header) {
                const channel = new SpatialChannel3D_1.SpatialChannel3D(instance.localState, 10, { header });
                channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 });
                const entity = channel.addEntity(createEntity());
                return [entity.nid];
            }
        },
        {
            name: 'ManualSpatialChannel2D',
            setup(instance, user, header) {
                const channel = new ManualSpatialChannel2D_1.ManualSpatialChannel2D(instance.localState, 10, { header });
                channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 });
                const entity = channel.addEntity(createEntity());
                return [entity.nid];
            }
        },
        {
            name: 'ManualSpatialChannel3D',
            setup(instance, user, header) {
                const channel = new ManualSpatialChannel3D_1.ManualSpatialChannel3D(instance.localState, 10, { header });
                channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 });
                const entity = channel.addEntity(createEntity());
                return [entity.nid];
            }
        },
        {
            name: 'EcsChannel',
            setup(instance, user, header) {
                const channel = new EcsChannel_1.EcsChannel(instance.localState, { header });
                channel.subscribe(user);
                const pid = channel.createEntity();
                const component = channel.addComponent(pid, createEntity(NType.Component));
                return [pid, component.nid];
            }
        },
        {
            name: 'EcsSpatialChannel2D',
            setup(instance, user, header) {
                const channel = new EcsSpatialChannel2D_1.EcsSpatialChannel2D(instance.localState, 10, { header });
                channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 });
                const pid = channel.createEntity();
                const component = channel.addSpatialComponent(pid, createEntity(NType.Component));
                return [pid, component.nid];
            }
        },
        {
            name: 'EcsSpatialChannel3D',
            setup(instance, user, header) {
                const channel = new EcsSpatialChannel3D_1.EcsSpatialChannel3D(instance.localState, 10, { header });
                channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 });
                const pid = channel.createEntity();
                const component = channel.addSpatialComponent(pid, createEntity(NType.Component));
                return [pid, component.nid];
            }
        }
    ];
    it.each(cases)('tags creates and exposes the header for $name', ({ setup, name }) => {
        const context = createContext();
        const instance = new Instance_1.Instance(context);
        const user = createUser(instance);
        const clientNetwork = createClientNetwork(context);
        const header = Object.assign(Object.assign({}, createEntity()), { label: name });
        instance.users.set(user.id, user);
        const nids = setup(instance, user, header);
        instance.step();
        clientNetwork.readSnapshot(BufferBinary_1.testBinaryAdapter.createReader(lastSentBuffer(user)));
        clientNetwork.processNextFrame();
        for (let i = 0; i < nids.length; i++) {
            expect(clientNetwork.store.getChannelHeader(nids[i])).toMatchObject({
                ntype: NType.Entity,
                label: name
            });
        }
    });
});
