"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const ChannelHeader_1 = require("../../common/ChannelHeader");
const EntityStore_1 = require("../EntityStore");
const PredictionLog_1 = require("./PredictionLog");
const TEST_CHANNEL_ID = 1;
function createStore() {
    const context = new Context_1.Context();
    context.register(1, (0, defineSchema_1.defineEntitySchema)({
        x: Binary_1.Binary.Float64,
        open: Binary_1.Binary.Boolean
    }));
    return new EntityStore_1.EntityStore(context);
}
function snapshot(args) {
    const createEntities = args.createEntities || [];
    const updateEntities = args.updateEntities || [];
    const deleteEntities = args.deleteEntities || [];
    const hasEntityCrud = createEntities.length > 0 || updateEntities.length > 0 || deleteEntities.length > 0;
    return Object.assign(Object.assign({ timestamp: -1, confirmedClientTick: -1, messages: [] }, args), { channelOpens: hasEntityCrud
            ? [{ channelId: TEST_CHANNEL_ID, header: (0, ChannelHeader_1.createChannelHeader)(TEST_CHANNEL_ID, ChannelHeader_1.ChannelType.Channel) }]
            : [], channels: hasEntityCrud ? [{
                channelId: TEST_CHANNEL_ID,
                messages: [],
                interpolatedMessages: [],
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities,
                updateEntities,
                updateEntityGroups: [],
                deleteEntities
            }] : [], createEntities: [], updateEntities: [], deleteEntities: [] });
}
describe('PredictionLog', () => {
    it('keeps command predictions pending until their client tick is confirmed', () => {
        const store = createStore();
        const log = new PredictionLog_1.PredictionLog();
        const local = { x: 0 };
        const events = [];
        const operation = log.addCommand({ dx: 1 }, 7, {
            affected: [{ nid: 1, props: ['x'] }],
            applyLocal: () => {
                local.x += 1;
            },
            validate: ({ store }) => { var _a; return ((_a = store.get(1)) === null || _a === void 0 ? void 0 : _a.x) === local.x; },
            reconcile: ({ accepted }) => {
                events.push(accepted ? 'accepted' : 'rejected');
            }
        });
        expect(local.x).toBe(1);
        expect(log.confirmTick(6)).toEqual([]);
        expect(log.getPendingCommands().map(op => op.id)).toEqual([operation.id]);
        const frame = store.applySnapshot(snapshot({
            timestamp: 1000,
            confirmedClientTick: 7,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, open: false }],
            updateEntities: [],
            deleteEntities: []
        }), 1);
        const resolutions = log.confirmTick(7, frame, store);
        expect(resolutions).toHaveLength(1);
        expect(resolutions[0].accepted).toBe(true);
        expect(operation.status).toBe(PredictionLog_1.PredictionOperationStatus.Confirmed);
        expect(log.getPendingCommands()).toEqual([]);
        expect(events).toEqual(['accepted']);
    });
    it('lets command reconciliation correct local state from authority', () => {
        const store = createStore();
        const log = new PredictionLog_1.PredictionLog();
        const local = { x: 0 };
        log.addCommand({ dx: 2 }, 10, {
            affected: [{ nid: 1, props: ['x'] }],
            applyLocal: () => {
                local.x = 2;
            },
            validate: ({ store }) => { var _a; return ((_a = store.get(1)) === null || _a === void 0 ? void 0 : _a.x) === local.x; },
            reconcile: ({ accepted, store }) => {
                if (!accepted) {
                    local.x = store.get(1).x;
                }
            }
        });
        const frame = store.applySnapshot(snapshot({
            timestamp: 1000,
            confirmedClientTick: 10,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, open: false }],
            updateEntities: [],
            deleteEntities: []
        }), 1);
        const resolutions = log.confirmTick(10, frame, store);
        expect(resolutions[0].accepted).toBe(false);
        expect(local.x).toBe(1);
    });
    it('resolves request predictions by request id instead of confirmed tick alone', () => {
        const store = createStore();
        const log = new PredictionLog_1.PredictionLog();
        const localSwitch = { open: false };
        log.addRequest(42, 8, { nid: 1, open: true }, 3, {
            affected: [{ nid: 1, props: ['open'] }],
            applyLocal: () => {
                localSwitch.open = true;
            },
            validate: ({ response }) => response.accepted,
            reconcile: ({ accepted, response }) => {
                if (!accepted) {
                    localSwitch.open = response.open;
                }
            }
        });
        const frame = store.applySnapshot(snapshot({
            timestamp: 1000,
            confirmedClientTick: 99,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, open: false }],
            updateEntities: [],
            deleteEntities: []
        }), 1);
        expect(localSwitch.open).toBe(true);
        const commandResolutions = log.confirmTick(99, frame, store);
        expect(commandResolutions).toEqual([]);
        expect(log.getPendingRequests()).toHaveLength(1);
        const resolution = log.resolveRequest(42, { accepted: false, open: false }, frame, store);
        expect(resolution === null || resolution === void 0 ? void 0 : resolution.accepted).toBe(false);
        expect(localSwitch.open).toBe(false);
        expect(log.getPendingRequests()).toEqual([]);
    });
});
