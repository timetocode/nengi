"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FixedStepInterpolator_1 = require("./FixedStepInterpolator");
const InterpolationTestHarness_1 = require("./InterpolationTestHarness");
function addMovingEntityFrames(harness) {
    harness.receive({
        timestamp: 1000,
        createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
    }, 1000);
    harness.receive({
        timestamp: 1050,
        updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
    }, 1027);
    harness.receive({
        timestamp: 1100,
        updateEntities: [{ nid: 1, prop: 'x', value: 20 }]
    }, 1091);
    harness.receive({
        timestamp: 1150,
        updateEntities: [{ nid: 1, prop: 'x', value: 30 }]
    }, 1092);
}
describe('FixedStepInterpolator', () => {
    it('starts playback at the desired tick buffer behind the latest frame', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        addMovingEntityFrames(harness);
        const sample = harness.sample(100, 1125);
        const entity = sample.entities.get(1);
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.targetTick).toBeCloseTo(2);
        expect(sample.targetFrameTick).toBe(2);
        expect(sample.alpha).toBeCloseTo(0);
        expect(sample.frameA.tick).toBe(2);
        expect(sample.frameB.tick).toBe(3);
        expect(entity.x).toBe(10);
    });
    it('does not use Chronus average time difference for interpolation playback', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        addMovingEntityFrames(harness);
        harness.client.network.chronus.averageTimeDifference = 25;
        const sample = harness.sample(100, 1175);
        const entity = sample.entities.get(1);
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.targetTick).toBeCloseTo(2);
        expect(entity.x).toBe(10);
    });
    it('does not move the sampled target tick backward when clock offset samples jitter', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        addMovingEntityFrames(harness);
        harness.client.network.chronus.averageTimeDifference = 0;
        const first = harness.sample(100, 1125);
        harness.client.network.chronus.averageTimeDifference = 30;
        const second = harness.sample(100, 1135);
        expect(first.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(second.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(second.targetTick).toBeGreaterThanOrEqual(first.targetTick);
        expect(second.entities.get(1).x).toBeGreaterThanOrEqual(first.entities.get(1).x);
    });
    it('returns explicit statuses instead of extrapolating', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        expect(harness.sample(100, 1125).status).toBe(FixedStepInterpolator_1.InterpolationStatus.InsufficientHistory);
        harness.receive({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }, 1000);
        expect(harness.sample(100, 1125).status).toBe(FixedStepInterpolator_1.InterpolationStatus.InsufficientHistory);
        harness.receive({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }, 1050);
        expect(harness.sample(100, 1075).status).toBe(FixedStepInterpolator_1.InterpolationStatus.BeforeHistory);
        const held = harness.sample(100, 1250);
        expect(held.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(held.targetFrameTick).toBe(2);
        expect(held.entities.get(1).x).toBe(10);
    });
    it('changing interpolation delay changes the sampled target tick immediately', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        addMovingEntityFrames(harness);
        const slower = harness.sample(100, 1175);
        const freshInterpolator = new FixedStepInterpolator_1.FixedStepInterpolator(harness.client);
        const faster = freshInterpolator.sample(50, 1175);
        expect(slower.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(faster.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(slower.targetTick).toBeCloseTo(2);
        expect(faster.targetTick).toBeCloseTo(3);
        expect(slower.entities.get(1).x).toBe(10);
        expect(faster.entities.get(1).x).toBe(20);
    });
    it('uses static delay policy when requested by the policy api', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness({
            adaptiveDelay: true,
            minDelayMs: 10,
            delay: { mode: 'static' }
        });
        harness.receiveMovingFrames(1000);
        const sample = harness.sample(100, 1175);
        expect(harness.interpolator.options.mode).toBe('static');
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.desiredBufferMs).toBe(100);
        expect(sample.targetTick).toBeCloseTo(2);
    });
    it('keeps the legacy adaptive delay flag working while the api settles', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness({
            adaptiveDelay: true,
            minDelayMs: 25,
            adaptiveSafetyTicks: 0.25
        });
        harness.receiveMovingFrames(1000);
        const sample = harness.sample(100, 1175);
        expect(harness.interpolator.options.mode).toBe('adaptive');
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.desiredBufferMs).toBeCloseTo(37.5);
    });
    it('can adapt below the requested static delay when enabled', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness({
            delay: {
                mode: 'adaptive',
                minMs: 25,
                safetyTicks: 0.25
            }
        });
        harness.receiveMovingFrames(1000);
        const sample = harness.sample(100, 1175);
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.desiredBufferMs).toBeCloseTo(37.5);
        expect(sample.desiredBufferMs).toBeLessThan(100);
        expect(sample.desiredBufferTicks).toBeCloseTo(0.75);
        expect(sample.targetTick).toBeCloseTo(3.25);
        expect(sample.entities.get(1).x).toBeCloseTo(22.5);
    });
    it('does not treat sustained latency offset as adaptive delay', () => {
        const lowLatency = new InterpolationTestHarness_1.InterpolationTestHarness({ delay: { mode: 'adaptive', minMs: 10, safetyTicks: 0 } });
        const highLatency = new InterpolationTestHarness_1.InterpolationTestHarness({ delay: { mode: 'adaptive', minMs: 10, safetyTicks: 0 } });
        lowLatency.receiveMovingFrames(1000);
        highLatency.receiveMovingFrames(1250);
        const lowLatencySample = lowLatency.sample(100, 1175);
        const highLatencySample = highLatency.sample(100, 1425);
        expect(lowLatencySample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(highLatencySample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(lowLatencySample.desiredBufferMs).toBe(10);
        expect(highLatencySample.desiredBufferMs).toBe(10);
        expect(highLatencySample.desiredBufferMs).toBe(lowLatencySample.desiredBufferMs);
        expect(highLatencySample.targetTick).toBeCloseTo(lowLatencySample.targetTick);
    });
    it('keeps raised adaptive delay until the connection has been stable long enough', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness({
            delay: {
                mode: 'adaptive',
                windowFrames: 3,
                minMs: 10,
                safetyTicks: 0,
                decreaseStableMs: 10,
                decreaseStepMs: 5
            }
        });
        harness.receive({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }, 1000);
        harness.receive({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }, 1050);
        harness.receive({
            timestamp: 1100,
            updateEntities: [{ nid: 1, prop: 'x', value: 20 }]
        }, 1130);
        const raised = harness.sample(100, 1130);
        expect(raised.desiredBufferMs).toBe(40);
        harness.receive({ timestamp: 1150 }, 1180);
        harness.receive({ timestamp: 1200 }, 1230);
        harness.receive({ timestamp: 1250 }, 1280);
        const beforeStableWindow = harness.sample(100, 1280);
        const afterStableWindow = harness.sample(100, 1291);
        expect(beforeStableWindow.desiredBufferMs).toBe(40);
        expect(afterStableWindow.desiredBufferMs).toBe(35);
    });
    it('ignores huge frame gaps when measuring adaptive delay', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness({
            delay: {
                mode: 'adaptive',
                windowFrames: 4,
                minMs: 10,
                safetyTicks: 0,
                maxSampleGapMs: 200
            }
        });
        harness.receive({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }, 1000);
        harness.receive({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }, 1050);
        harness.receive({
            timestamp: 1100,
            updateEntities: [{ nid: 1, prop: 'x', value: 20 }]
        }, 2050);
        harness.receive({
            timestamp: 1150,
            updateEntities: [{ nid: 1, prop: 'x', value: 30 }]
        }, 2100);
        const sample = harness.sample(100, 2100);
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.desiredBufferMs).toBe(10);
        expect(sample.targetTick).toBeCloseTo(3.8);
    });
    it('uses min adaptive delay when all recent timing samples are ignored', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness({
            delay: {
                mode: 'adaptive',
                windowFrames: 3,
                minMs: 10,
                safetyTicks: 0,
                maxSampleGapMs: 200
            }
        });
        harness.receive({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }, 1000);
        harness.receive({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }, 2050);
        const sample = harness.sample(100, 2050);
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.desiredBufferMs).toBe(10);
    });
    it('keeps the target buffer stable when frames arrive faster than their fixed server cadence', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        let latestSample = harness.sample(100, 1000);
        for (let i = 0; i < 90; i++) {
            const receivedAt = 1000 + (i * 47.5);
            harness.receive({
                timestamp: 1000 + (i * 50),
                createEntities: i === 0 ? [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }] : [],
                updateEntities: i > 0 ? [{ nid: 1, prop: 'x', value: i }] : []
            }, receivedAt);
            latestSample = harness.sample(100, 1000 + (i * 50));
        }
        expect(latestSample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(latestSample.latestBufferTicks).not.toBeNull();
        expect(latestSample.latestBufferTicks).toBeCloseTo(2);
    });
    it('handles multiple snapshots delivered in a burst as consecutive fixed ticks', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        harness.receive({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        }, 1000);
        harness.receive({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        }, 1000);
        harness.receive({
            timestamp: 1100,
            updateEntities: [{ nid: 1, prop: 'x', value: 20 }]
        }, 1000);
        const sample = harness.sample(100, 1125);
        expect(sample.status).toBe(FixedStepInterpolator_1.InterpolationStatus.Ok);
        expect(sample.frameA.tick).toBe(1);
        expect(sample.frameB.tick).toBe(2);
        expect(sample.entities.get(1).x).toBe(0);
    });
    it('can sample selected entities and full visible state', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        harness.receive({
            timestamp: 1000,
            createEntities: [
                { nid: 1, ntype: 1, x: 0, y: 0, label: 'a' },
                { nid: 2, ntype: 1, x: 100, y: 100, label: 'b' }
            ]
        }, 1000);
        harness.receive({
            timestamp: 1050,
            updateEntities: [
                { nid: 1, prop: 'x', value: 10 },
                { nid: 2, prop: 'x', value: 200 },
                { nid: 2, prop: 'label', value: 'changed' }
            ]
        }, 1050);
        const selected = harness.interpolator.getEntities([2], 50, 1125);
        const state = harness.interpolator.getState(50, 1125);
        expect(selected.size).toBe(1);
        expect(selected.get(2).x).toBe(100);
        expect(state).not.toBeNull();
        expect(state.entities.get(1).x).toBe(0);
        expect(state.entities.get(2).label).toBe('changed');
    });
    it('keeps deleted entities alive until the delete frame becomes the lower interpolation bound', () => {
        const harness = new InterpolationTestHarness_1.InterpolationTestHarness();
        harness.receive({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 10, y: 20, label: 'a' }]
        }, 1000);
        harness.receive({
            timestamp: 1050,
            deleteEntities: [1]
        }, 1050);
        harness.receive({ timestamp: 1100 }, 1100);
        const visible = harness.interpolator.getEntity(1, 100, 1125);
        const gone = harness.interpolator.getEntity(1, 100, 1250);
        expect(visible).not.toBeNull();
        expect(visible.x).toBe(10);
        expect(gone).toBeNull();
    });
});
describe('ClientNetwork interpolation timestamps', () => {
    it('synthesizes missing snapshot timestamps from the previous fixed server tick', () => {
        const client = (0, InterpolationTestHarness_1.createInterpolationTestClient)();
        const first = (0, InterpolationTestHarness_1.createTestSnapshot)({ timestamp: 1000 });
        const second = (0, InterpolationTestHarness_1.createTestSnapshot)({ timestamp: -1 });
        client.network.resolveSnapshotTimestamp(first, 1000);
        client.network.previousSnapshot = first;
        client.network.resolveSnapshotTimestamp(second, 1050);
        expect(first.timestamp).toBe(1000);
        expect(second.timestamp).toBe(1050);
    });
    it('uses real server timestamps when snapshots include them', () => {
        const client = (0, InterpolationTestHarness_1.createInterpolationTestClient)();
        const first = (0, InterpolationTestHarness_1.createTestSnapshot)({
            timestamp: 1000,
            createEntities: [{ nid: 1, ntype: 1, x: 0, y: 0, label: 'a' }]
        });
        client.network.resolveSnapshotTimestamp(first, 1000);
        const frame1 = (0, InterpolationTestHarness_1.applyTestSnapshot)(client, first, 1000);
        client.network.previousSnapshot = first;
        const second = (0, InterpolationTestHarness_1.createTestSnapshot)({
            timestamp: -1,
            updateEntities: [{ nid: 1, prop: 'x', value: 10 }]
        });
        client.network.resolveSnapshotTimestamp(second, 1050);
        const frame2 = (0, InterpolationTestHarness_1.applyTestSnapshot)(client, second, 1050);
        client.network.previousSnapshot = second;
        const third = (0, InterpolationTestHarness_1.createTestSnapshot)({
            timestamp: 1104,
            updateEntities: [{ nid: 1, prop: 'x', value: 20 }]
        });
        client.network.resolveSnapshotTimestamp(third, 1104);
        const frame3 = (0, InterpolationTestHarness_1.applyTestSnapshot)(client, third, 1104);
        expect(frame1.timestamp).toBe(1000);
        expect(frame2.timestamp).toBe(1050);
        expect(frame3.timestamp).toBe(1104);
        expect(frame2.timestamp - frame1.timestamp).toBe(50);
        expect(frame3.timestamp - frame2.timestamp).toBe(54);
    });
});
