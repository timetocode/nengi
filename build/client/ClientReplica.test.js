"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../common/binary/Binary");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const ChannelHeader_1 = require("../common/ChannelHeader");
const Context_1 = require("../common/Context");
const BufferBinary_1 = require("../testSupport/BufferBinary");
const Client_1 = require("./Client");
const ClientEntityMode_1 = require("./ClientEntityMode");
const ClientReplica_1 = require("./ClientReplica");
class MockAdapter {
    constructor() {
        this.binary = BufferBinary_1.testBinaryAdapter;
    }
    connect() {
        return Promise.resolve({ accepted: true });
    }
    flush() {
    }
}
function createClient() {
    const context = new Context_1.Context();
    context.register(1, (0, defineSchema_1.defineEntitySchema)({
        x: { type: Binary_1.Binary.Float64, interp: true },
        y: { type: Binary_1.Binary.Float64, interp: true },
        label: Binary_1.Binary.String
    }));
    context.register(2, (0, defineSchema_1.defineMessageSchema)({
        nid: Binary_1.Binary.UInt32
    }));
    context.register(3, (0, defineSchema_1.defineEntitySchema)({
        label: Binary_1.Binary.String
    }));
    return new Client_1.Client(context, MockAdapter, 20);
}
function snapshot(args) {
    return Object.assign({ timestamp: -1, confirmedClientTick: -1, messages: [], createEntities: [], updateEntities: [], deleteEntities: [] }, args);
}
function applySnapshot(client, data) {
    const receivedAt = data.timestamp === -1 ? 1000 + (client.network.getPendingFrameCount() * 50) : data.timestamp;
    client.network.queueSnapshot(data, receivedAt);
    client.network.previousSnapshot = data;
}
function channelOpen(channelId, header, channelType = ChannelHeader_1.ChannelType.Channel) {
    return { channelId, header: (0, ChannelHeader_1.createChannelHeader)(channelId, channelType, header) };
}
// ClientReplica is retained as a legacy transition surface while userland moves
// to direct channel-scoped frame consumption.
describe.skip('ClientReplica legacy compatibility', () => {
    it('passes default channel headers to global entity bindings', () => {
        var _a, _b, _c, _d, _e, _f;
        const client = createClient();
        const replica = new ClientReplica_1.ClientReplica(client);
        const events = [];
        replica.bindEntity(1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: (entity, ctx) => {
                var _a, _b, _c, _d, _e;
                events.push(`create:${entity.nid}:channel:${(_b = (_a = ctx.channel) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'none'}:header:${(_e = (_d = (_c = ctx.channel) === null || _c === void 0 ? void 0 : _c.header) === null || _d === void 0 ? void 0 : _d.ntype) !== null && _e !== void 0 ? _e : 'none'}`);
                return { nid: entity.nid };
            }
        });
        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(42)],
            createEntities: [{ nid: 1, ntype: 1, x: 5, y: 9, label: 'stone' }]
        }));
        replica.process();
        expect(events).toEqual(['create:1:channel:42:header:0']);
        expect((_b = (_a = replica.entities.get(1)) === null || _a === void 0 ? void 0 : _a.channel) === null || _b === void 0 ? void 0 : _b.id).toBe(42);
        expect((_d = (_c = replica.entities.get(1)) === null || _c === void 0 ? void 0 : _c.channel) === null || _d === void 0 ? void 0 : _d.open).toBe(true);
        expect((_f = (_e = replica.entities.get(1)) === null || _e === void 0 ? void 0 : _e.channel) === null || _f === void 0 ? void 0 : _f.header.ntype).toBe(0);
    });
    it('uses the channel binding instead of the global binding when a channel header matches', () => {
        const client = createClient();
        const replica = new ClientReplica_1.ClientReplica(client);
        const events = [];
        replica.bindEntity(1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: entity => {
                events.push(`global:create:${entity.nid}`);
                return { nid: entity.nid };
            }
        });
        replica.bindChannel(3, {
            open: channel => events.push(`channel:open:${channel.id}:${channel.header.label}`),
            close: channel => events.push(`channel:close:${channel.id}:${channel.header.label}`)
        });
        replica.bindChannelEntity(3, 1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: (entity, ctx) => {
                events.push(`channel:create:${ctx.channel.id}:${ctx.channel.header.label}:${entity.nid}`);
                return { nid: entity.nid };
            },
            update: (entity, _local, ctx) => {
                var _a;
                events.push(`channel:update:${ctx.channel.id}:${(_a = ctx.update) === null || _a === void 0 ? void 0 : _a.prop}:${entity.x}`);
            },
            destroy: (_local, ctx) => {
                var _a, _b;
                events.push(`channel:destroy:${(_b = (_a = ctx.channel) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'none'}:${ctx.nid}`);
            }
        });
        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(10, { nid: 0, ntype: 3, label: 'inventory:10' }, ChannelHeader_1.ChannelType.Channel)],
            createEntities: [{ nid: 1, ntype: 1, x: 5, y: 9, label: 'gem' }]
        }));
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 6 }]
        }));
        applySnapshot(client, snapshot({
            timestamp: 1100,
            deleteEntities: [1]
        }));
        replica.process();
        expect(events).toEqual([
            'channel:open:10:inventory:10',
            'channel:create:10:inventory:10:1',
            'channel:update:10:x:6',
            'channel:destroy:10:1'
        ]);
    });
    it('purges default-header channel entities when the channel closes', () => {
        const client = createClient();
        const replica = new ClientReplica_1.ClientReplica(client);
        const events = [];
        replica.bindEntity(1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: (entity, ctx) => {
                var _a, _b;
                events.push(`create:${entity.nid}:channel:${(_b = (_a = ctx.channel) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'none'}`);
                return { nid: entity.nid };
            },
            destroy: (_local, ctx) => {
                var _a, _b, _c, _d;
                events.push(`destroy:${ctx.nid}:channel:${(_b = (_a = ctx.channel) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'none'}:closed:${(_d = (_c = ctx.closedChannel) === null || _c === void 0 ? void 0 : _c.channelId) !== null && _d !== void 0 ? _d : 'none'}`);
            }
        });
        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(42, 'world')],
            createEntities: [{ nid: 1, ntype: 1, x: 5, y: 9, label: 'stone' }]
        }));
        applySnapshot(client, snapshot({
            timestamp: 1050,
            channelCloses: [{ channelId: 42 }]
        }));
        const batch = replica.process();
        expect(events).toEqual([
            'create:1:channel:42',
            'destroy:1:channel:42:closed:42'
        ]);
        expect(batch.deleteEntities).toEqual([]);
        expect(batch.closedChannels).toEqual([
            {
                channelId: 42,
                header: (0, ChannelHeader_1.createChannelHeader)(42, ChannelHeader_1.ChannelType.Channel),
                entityNids: [1]
            }
        ]);
        expect(replica.entities.has(1)).toBe(false);
        expect(replica.channels.has(42)).toBe(false);
    });
    it('creates ECS components once even though frames expose them as component and entity creates', () => {
        const client = createClient();
        const replica = new ClientReplica_1.ClientReplica(client);
        const events = [];
        replica.bindEntity(1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: entity => {
                events.push(`create:${entity.pid}:${entity.nid}`);
                return { nid: entity.nid };
            }
        });
        applySnapshot(client, snapshot({
            timestamp: 1000,
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, pid: 100, ntype: 1, x: 5, y: 9, label: 'transform' }]
        }));
        replica.process();
        expect(events).toEqual(['create:100:1']);
    });
    it('routes ECS roots and components through explicit ECS handlers', () => {
        const client = createClient();
        const replica = new ClientReplica_1.ClientReplica(client);
        const events = [];
        replica.onEcsCreateEntity((pid, frame) => {
            events.push(`root:create:${pid}:tick:${frame.tick}`);
        });
        replica.onEcsDeleteEntity((pid, frame) => {
            events.push(`root:delete:${pid}:tick:${frame.tick}`);
        });
        replica.bindEcsComponent(1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: (component, ctx) => {
                events.push(`component:create:${ctx.pid}:${component.nid}:${component.x}`);
                return { pid: ctx.pid, componentNid: component.nid };
            },
            update: (component, local, ctx) => {
                var _a;
                events.push(`component:update:${local.pid}:${local.componentNid}:${ctx.pid}:${(_a = ctx.update) === null || _a === void 0 ? void 0 : _a.prop}:${component.x}`);
            },
            destroy: (local, ctx) => {
                var _a;
                events.push(`component:destroy:${local.pid}:${local.componentNid}:${(_a = ctx.pid) !== null && _a !== void 0 ? _a : 'none'}`);
            }
        });
        applySnapshot(client, snapshot({
            timestamp: 1000,
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, pid: 100, ntype: 1, x: 5, y: 9, label: 'transform' }]
        }));
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 6 }]
        }));
        applySnapshot(client, snapshot({
            timestamp: 1100,
            ecsDeleteEntities: [100]
        }));
        const batch = replica.process();
        expect(events).toEqual([
            'root:create:100:tick:1',
            'component:create:100:1:5',
            'component:update:100:1:100:x:6',
            'component:destroy:100:1:100',
            'root:delete:100:tick:3'
        ]);
        expect(batch.ecsCreateEntities).toEqual([100]);
        expect(batch.ecsCreateComponents.map(component => component.nid)).toEqual([1]);
        expect(batch.ecsDeleteEntities).toEqual([100]);
    });
    it('purges ECS component bindings when their channel closes without treating it as a root delete', () => {
        const client = createClient();
        const replica = new ClientReplica_1.ClientReplica(client);
        const events = [];
        replica.onEcsCreateEntity(pid => {
            events.push(`root:create:${pid}`);
        });
        replica.onEcsDeleteEntity(pid => {
            events.push(`root:delete:${pid}`);
        });
        replica.bindEcsComponent(1, {
            mode: ClientEntityMode_1.ClientEntityMode.Raw,
            create: (component, ctx) => {
                var _a, _b;
                events.push(`component:create:${ctx.pid}:${component.nid}:channel:${(_b = (_a = ctx.channel) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'none'}`);
                return { pid: ctx.pid, componentNid: component.nid };
            },
            destroy: (local, ctx) => {
                var _a, _b, _c, _d;
                events.push(`component:destroy:${local.pid}:${local.componentNid}:channel:${(_b = (_a = ctx.channel) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 'none'}:closed:${(_d = (_c = ctx.closedChannel) === null || _c === void 0 ? void 0 : _c.channelId) !== null && _d !== void 0 ? _d : 'none'}`);
            }
        });
        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(42, 'ecs', ChannelHeader_1.ChannelType.EcsChannel)],
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, pid: 100, ntype: 1, x: 5, y: 9, label: 'transform' }]
        }));
        applySnapshot(client, snapshot({
            timestamp: 1050,
            channelCloses: [{ channelId: 42 }]
        }));
        const batch = replica.process();
        expect(events).toEqual([
            'root:create:100',
            'component:create:100:1:channel:42',
            'component:destroy:100:1:channel:42:closed:42'
        ]);
        expect(batch.closedChannels).toEqual([
            {
                channelId: 42,
                header: (0, ChannelHeader_1.createChannelHeader)(42, ChannelHeader_1.ChannelType.EcsChannel),
                entityNids: [100, 1]
            }
        ]);
        expect(replica.entities.has(1)).toBe(false);
    });
});
