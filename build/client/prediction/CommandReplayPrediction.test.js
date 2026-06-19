"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const defineSchema_1 = require("../../common/binary/schema/defineSchema");
const Context_1 = require("../../common/Context");
const ChannelHeader_1 = require("../../common/ChannelHeader");
const Client_1 = require("../Client");
const CommandReplayPrediction_1 = require("./CommandReplayPrediction");
const BufferBinary_1 = require("../../testSupport/BufferBinary");
const TEST_CHANNEL_ID = 1;
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
        x: Binary_1.Binary.Float64,
        y: Binary_1.Binary.Float64
    }));
    return new Client_1.Client(context, MockAdapter, 20);
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
function createMovement(client, local) {
    return new CommandReplayPrediction_1.CommandReplayPrediction({
        client,
        nid: 1,
        getLocal: () => local,
        createReplayState: authoritative => ({ x: authoritative.x, y: authoritative.y }),
        applyCommand: (state, command) => {
            state.x += command.dx;
            state.y += command.dy;
        },
        applyReplayState: (local, replayState) => {
            local.x = replayState.x;
            local.y = replayState.y;
        },
        affectedProps: ['x', 'y']
    });
}
describe('CommandReplayPrediction', () => {
    it('does not correct when authority plus pending commands matches local prediction', () => {
        const client = createClient();
        const local = { x: 0, y: 0 };
        const movement = createMovement(client, local);
        movement.predict({ ntype: 2, dx: 1, dy: 0 });
        client.network.incrementClientTick();
        movement.predict({ ntype: 2, dx: 1, dy: 0 });
        client.network.queueSnapshot(snapshot({
            timestamp: 1000,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, y: 0 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000);
        client.network.processNextFrame();
        const correction = movement.reconcile();
        expect(correction).toEqual({
            corrected: false,
            error: 0,
            replayed: 1,
            state: { x: 2, y: 0 }
        });
        expect(local).toEqual({ x: 2, y: 0 });
    });
    it('corrects to authoritative state when the server rejected predicted movement', () => {
        const client = createClient();
        const local = { x: 0, y: 0 };
        const movement = createMovement(client, local);
        movement.predict({ ntype: 2, dx: 1, dy: 0 });
        client.network.queueSnapshot(snapshot({
            timestamp: 1000,
            confirmedClientTick: 1,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0 }],
            updateEntities: [],
            deleteEntities: []
        }), 1000);
        client.network.processNextFrame();
        const correction = movement.reconcile();
        expect(correction === null || correction === void 0 ? void 0 : correction.corrected).toBe(true);
        expect(correction === null || correction === void 0 ? void 0 : correction.error).toBe(1);
        expect(correction === null || correction === void 0 ? void 0 : correction.replayed).toBe(0);
        expect(local).toEqual({ x: 0, y: 0 });
    });
});
