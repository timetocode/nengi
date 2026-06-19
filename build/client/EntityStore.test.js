"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../common/binary/Binary");
const ChannelHeader_1 = require("../common/ChannelHeader");
const Context_1 = require("../common/Context");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const EntityStore_1 = require("./EntityStore");
const NType = {
    Player: 1,
    InventoryItem: 2,
    InventoryHeader: 3
};
function createStore() {
    const context = new Context_1.Context();
    context.register(NType.Player, (0, defineSchema_1.defineEntitySchema)({
        x: { type: Binary_1.Binary.Float64, interp: true },
        y: { type: Binary_1.Binary.Float64, interp: true },
        hp: Binary_1.Binary.UInt8
    }));
    context.register(NType.InventoryItem, (0, defineSchema_1.defineEntitySchema)({
        itemId: Binary_1.Binary.UInt16,
        quantity: Binary_1.Binary.UInt16
    }));
    context.register(NType.InventoryHeader, (0, defineSchema_1.defineEntitySchema)({
        inventoryId: Binary_1.Binary.UInt16,
        label: Binary_1.Binary.String
    }));
    return new EntityStore_1.EntityStore(context);
}
function snapshot(args) {
    return Object.assign({ timestamp: 1000, confirmedClientTick: -1, messages: [], createEntities: [], updateEntities: [], deleteEntities: [] }, args);
}
describe('EntityStore raw client surface', () => {
    it('applies regular channel creates, updates, deletes, and exposes channel facts', () => {
        var _a, _b;
        const store = createStore();
        const frame1 = store.applySnapshot(snapshot({
            channelOpens: [{
                    channelId: 50,
                    header: (0, ChannelHeader_1.createChannelHeader)(50, ChannelHeader_1.ChannelType.Channel, {
                        nid: 50,
                        ntype: NType.InventoryHeader,
                        inventoryId: 7,
                        label: 'bag'
                    })
                }],
            channels: [{
                    channelId: 50,
                    ecsCreateEntities: [],
                    ecsCreateComponents: [],
                    ecsDeleteEntities: [],
                    createEntities: [{ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 }],
                    updateEntities: [],
                    updateEntityGroups: [],
                    deleteEntities: [],
                    messages: [],
                    interpolatedMessages: []
                }]
        }), 1);
        expect(store.get(10)).toEqual({ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 });
        expect(store.getEntityChannelId(10)).toBe(50);
        expect((_a = store.getChannelHeaderById(50)) === null || _a === void 0 ? void 0 : _a.inventoryId).toBe(7);
        expect(frame1.requireChannel(50).createEntities).toEqual([{ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 }]);
        const frame2 = store.applySnapshot(snapshot({
            channels: [{
                    channelId: 50,
                    ecsCreateEntities: [],
                    ecsCreateComponents: [],
                    ecsDeleteEntities: [],
                    createEntities: [],
                    updateEntities: [{ nid: 10, prop: 'quantity', value: 5 }],
                    updateEntityGroups: [],
                    deleteEntities: [],
                    messages: [],
                    interpolatedMessages: []
                }]
        }), 2);
        expect((_b = store.get(10)) === null || _b === void 0 ? void 0 : _b.quantity).toBe(5);
        expect(frame2.requireChannel(50).updateEntities).toEqual([{ nid: 10, prop: 'quantity', previous: 2, value: 5 }]);
        const frame3 = store.applySnapshot(snapshot({
            channels: [{
                    channelId: 50,
                    ecsCreateEntities: [],
                    ecsCreateComponents: [],
                    ecsDeleteEntities: [],
                    createEntities: [],
                    updateEntities: [],
                    updateEntityGroups: [],
                    deleteEntities: [10],
                    messages: [],
                    interpolatedMessages: []
                }]
        }), 3);
        expect(store.get(10)).toBeUndefined();
        expect(frame3.requireChannel(50).deletedEntities).toEqual([{
                nid: 10,
                entity: { nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 5 },
                channelId: 50
            }]);
    });
    it('keeps latest raw state in the store while history provides sampled past state', () => {
        var _a, _b, _c;
        const store = createStore();
        store.applySnapshot(snapshot({
            channelOpens: [{
                    channelId: 60,
                    header: (0, ChannelHeader_1.createChannelHeader)(60, ChannelHeader_1.ChannelType.Channel, undefined, 'world')
                }],
            channels: [{
                    channelId: 60,
                    ecsCreateEntities: [],
                    ecsCreateComponents: [],
                    ecsDeleteEntities: [],
                    createEntities: [{ nid: 1, ntype: NType.Player, x: 0, y: 0, hp: 10 }],
                    updateEntities: [],
                    updateEntityGroups: [],
                    deleteEntities: [],
                    messages: [],
                    interpolatedMessages: []
                }]
        }), 1);
        store.applySnapshot(snapshot({
            channels: [{
                    channelId: 60,
                    ecsCreateEntities: [],
                    ecsCreateComponents: [],
                    ecsDeleteEntities: [],
                    createEntities: [],
                    updateEntities: [{ nid: 1, prop: 'x', value: 10 }],
                    updateEntityGroups: [],
                    deleteEntities: [],
                    messages: [],
                    interpolatedMessages: []
                }]
        }), 2);
        expect((_a = store.get(1)) === null || _a === void 0 ? void 0 : _a.x).toBe(10);
        expect((_b = store.history.getAt(1, 1)) === null || _b === void 0 ? void 0 : _b.x).toBe(0);
        expect((_c = store.history.getAt(1, 2)) === null || _c === void 0 ? void 0 : _c.x).toBe(10);
    });
    it('rejects top-level entity CRUD', () => {
        const store = createStore();
        expect(() => store.applySnapshot(snapshot({
            createEntities: [{ nid: 1, ntype: NType.Player, x: 0, y: 0, hp: 10 }]
        }), 1)).toThrow('EntityStore requires channel-scoped entity CRUD.');
    });
});
