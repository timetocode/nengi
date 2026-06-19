"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterpolationTestHarness = void 0;
exports.createInterpolationTestContext = createInterpolationTestContext;
exports.createTestSnapshot = createTestSnapshot;
exports.createInterpolationTestClient = createInterpolationTestClient;
exports.applyTestSnapshot = applyTestSnapshot;
const Binary_1 = require("../common/binary/Binary");
const defineSchema_1 = require("../common/binary/schema/defineSchema");
const Context_1 = require("../common/Context");
const Client_1 = require("./Client");
const FixedStepInterpolator_1 = require("./FixedStepInterpolator");
const BufferBinary_1 = require("../testSupport/BufferBinary");
const ChannelHeader_1 = require("../common/ChannelHeader");
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
function createInterpolationTestContext() {
    const context = new Context_1.Context();
    context.register(1, (0, defineSchema_1.defineEntitySchema)({
        x: { type: Binary_1.Binary.Float64, interp: true },
        y: { type: Binary_1.Binary.Float64, interp: true },
        label: Binary_1.Binary.String
    }));
    return context;
}
function createTestSnapshot(args) {
    const createEntities = args.createEntities || [];
    const updateEntities = args.updateEntities || [];
    const deleteEntities = args.deleteEntities || [];
    const hasEntityCrud = createEntities.length > 0 || updateEntities.length > 0 || deleteEntities.length > 0;
    const channels = args.channels || (hasEntityCrud ? [{
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
        }] : []);
    return Object.assign(Object.assign({ timestamp: -1, confirmedClientTick: -1, messages: [] }, args), { channelOpens: args.channelOpens || (hasEntityCrud
            ? [{ channelId: TEST_CHANNEL_ID, header: (0, ChannelHeader_1.createChannelHeader)(TEST_CHANNEL_ID, ChannelHeader_1.ChannelType.Channel) }]
            : []), channels, createEntities: [], updateEntities: [], deleteEntities: [] });
}
function createInterpolationTestClient(tickRate = 20) {
    return new Client_1.Client(createInterpolationTestContext(), MockAdapter, tickRate);
}
function applyTestSnapshot(client, snapshot, receivedAt) {
    const fullSnapshot = createTestSnapshot(snapshot);
    const frame = client.network.store.applySnapshot(fullSnapshot, client.network.frameTick, receivedAt);
    client.network.frameTick++;
    client.network.frames.push(frame);
    client.network.latestFrame = frame;
    client.network.previousSnapshot = fullSnapshot;
    return frame;
}
class InterpolationTestHarness {
    constructor(options = {}, now = 1000, tickRate = 20) {
        this.context = createInterpolationTestContext();
        this.client = new Client_1.Client(this.context, MockAdapter, tickRate);
        this.interpolator = new FixedStepInterpolator_1.FixedStepInterpolator(this.client, options);
        this.now = now;
    }
    advance(ms) {
        this.now += ms;
        return this.now;
    }
    receive(snapshot, receivedAt = this.now) {
        return applyTestSnapshot(this.client, snapshot, receivedAt);
    }
    receiveMovingFrames(receivedAtStart, count = 4, spacingMs = 50) {
        for (let i = 0; i < count; i++) {
            this.receive({
                timestamp: 1000 + (i * spacingMs),
                createEntities: i === 0 ? [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }] : [],
                updateEntities: i > 0 ? [{ nid: 1, prop: 'x', value: i * 10 }] : []
            }, receivedAtStart + (i * spacingMs));
        }
    }
    sample(interpDelay, now = this.now) {
        this.now = now;
        return this.interpolator.sample(interpDelay, this.now);
    }
}
exports.InterpolationTestHarness = InterpolationTestHarness;
