"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Historian2D_1 = require("./Historian2D");
function trackBody(history, body, timeMs) {
    const options = {
        nid: 'nid',
        x: 'x',
        y: 'y',
        radius: 'radius',
        flags: 'flags'
    };
    if (body.halfWidth !== undefined && body.halfHeight !== undefined) {
        return history.trackSpatial(body, Object.assign(Object.assign({}, options), { halfWidth: 'halfWidth', halfHeight: 'halfHeight' }), timeMs);
    }
    return history.trackSpatial(body, Object.assign({}, options), timeMs);
}
describe('Historian2D', () => {
    it('records compact spatial samples without retaining live object references', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const body = { nid: 1, x: 10, y: 20, radius: 4, flags: 7 };
        trackBody(history, body, 0);
        history.record(1, 50);
        body.x = 999;
        body.y = 999;
        body.flags = 2;
        const sample = history.getSpatialNearest(1, 50);
        expect(sample).toMatchObject({ nid: 1, tick: 1, timeMs: 50, x: 10, y: 20, radius: 4, flags: 7 });
    });
    it('can return a target id while sampling position from another object', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const npc = { nid: 1, hp: 100 };
        const transform = { nid: 2, x: 10, y: 20 };
        history.trackSpatialTarget(npc.nid, transform, {
            x: 'x',
            y: 'y',
            halfWidth: 8,
            halfHeight: 12
        }, 0);
        history.record(1, 50);
        transform.x = 999;
        transform.y = 999;
        const hit = history.queryRayNearest(50, 0, 20, 30, 20)[0];
        expect(hit.sample).toMatchObject({ nid: npc.nid, x: 10, y: 20, halfWidth: 8, halfHeight: 12 });
    });
    it('returns nearest and interpolated spatial samples', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 1 };
        trackBody(history, body, 0);
        history.record(1, 100);
        body.x = 100;
        body.y = 50;
        body.radius = 20;
        body.flags = 2;
        history.record(2, 200);
        expect(history.getSpatialNearest(1, 151)).toMatchObject({ x: 100, y: 50, radius: 20 });
        expect(history.getSpatialInterpolated(1, 150)).toMatchObject({ x: 50, y: 25, radius: 15, flags: 2 });
    });
    it('keeps temporal values as intervals independent of sampled frames', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        history.setFlag(1, 'invulnerable', false, 100);
        history.setFlag(1, 'invulnerable', true, 140);
        history.setFlag(1, 'invulnerable', false, 220);
        history.setValue(1, 'stance', 'ice-block', 140);
        history.setValue(1, 'stance', 'normal', 220);
        expect(history.wasFlagActive(1, 'invulnerable', 120)).toBe(false);
        expect(history.wasFlagActive(1, 'invulnerable', 180)).toBe(true);
        expect(history.wasFlagActive(1, 'invulnerable', 250)).toBe(false);
        expect(history.getValue(1, 'stance', 180)).toBe('ice-block');
        expect(history.getValue(1, 'stance', 250)).toBe('normal');
    });
    it('uses existence intervals to filter historical spatial queries', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 0 };
        trackBody(history, body, 0);
        history.record(1, 100);
        history.setExists(1, false, 120);
        expect(history.getSpatialNearest(1, 100)).not.toBeNull();
        expect(history.getSpatialNearest(1, 130)).toBeNull();
        expect(history.queryCircleNearest(130, 0, 0, 100)).toHaveLength(0);
    });
    it('defaults spatial track and untrack existence to the latest recorded time', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 0 };
        history.record(1, 100);
        trackBody(history, body);
        expect(history.existsAt(1, 99)).toBe(false);
        expect(history.existsAt(1, 100)).toBe(true);
        history.record(2, 200);
        history.untrackSpatial(1);
        expect(history.existsAt(1, 199)).toBe(true);
        expect(history.existsAt(1, 200)).toBe(false);
    });
    it('queries circles, aabbs, and rays against historical samples', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const circle = { nid: 1, x: 40, y: 0, radius: 10, flags: 0 };
        const box = { nid: 2, x: 90, y: 0, radius: 0, halfWidth: 10, halfHeight: 10, flags: 0 };
        const miss = { nid: 3, x: 40, y: 60, radius: 10, flags: 0 };
        trackBody(history, circle, 0);
        trackBody(history, box, 0);
        trackBody(history, miss, 0);
        history.record(1, 100);
        expect(history.queryCircleNearest(100, 0, 0, 35).map(sample => sample.nid)).toEqual([1]);
        expect(history.queryAabbNearest(100, 90, 20, 12, 12).map(sample => sample.nid)).toEqual([2]);
        const hits = history.queryRayNearest(100, 0, 0, 120, 0);
        expect(hits.map(hit => hit.sample.nid)).toEqual([1, 2]);
        expect(hits[0].distance).toBeCloseTo(30);
        expect(hits[1].distance).toBeCloseTo(80);
    });
    it('can ray query interpolated positions between retained frames', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const target = { nid: 1, x: 40, y: 30, radius: 8, flags: 0 };
        trackBody(history, target, 0);
        history.record(1, 100);
        target.y = -30;
        history.record(2, 200);
        expect(history.queryRayNearest(150, 0, 0, 80, 0)).toHaveLength(0);
        const hits = history.queryRayInterpolated(150, 0, 0, 80, 0);
        expect(hits).toHaveLength(1);
        expect(hits[0].sample.nid).toBe(1);
        expect(hits[0].sample.y).toBeCloseTo(0);
    });
    it('can record explicit copied spatial samples without tracking live objects', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const sample = { nid: 1, x: 10, y: 20, radius: 5, flags: 3 };
        history.recordSpatialSample(sample);
        sample.x = 999;
        sample.y = 999;
        sample.flags = 7;
        history.record(1, 100);
        expect(history.getStats()).toMatchObject({
            trackedSpatial: 0,
            pendingSpatialSamples: 0,
            retainedSamples: 1
        });
        expect(history.getSpatialNearest(1, 100)).toMatchObject({
            nid: 1,
            tick: 1,
            timeMs: 100,
            x: 10,
            y: 20,
            radius: 5,
            flags: 3
        });
    });
    it('uses explicit samples to override tracked samples for the same nid in a frame', () => {
        const history = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const body = { nid: 1, x: 10, y: 20, radius: 5, flags: 0 };
        trackBody(history, body, 0);
        history.recordSpatialSample({ nid: 1, x: 40, y: 50, radius: 8, flags: 9 });
        history.record(1, 100);
        expect(history.getSpatialNearest(1, 100)).toMatchObject({
            x: 40,
            y: 50,
            radius: 8,
            flags: 9
        });
        expect(history.queryCircleNearest(100, 40, 50, 1).map(sample => sample.nid)).toEqual([1]);
    });
    it('returns the same nearest query results with and without the grid index', () => {
        const brute = new Historian2D_1.Historian2D({ retentionMs: 1000 });
        const indexed = new Historian2D_1.Historian2D({
            retentionMs: 1000,
            spatialIndex: { type: 'grid', cellSize: 25 }
        });
        const bodies = [
            { nid: 1, x: 40, y: 0, radius: 10, flags: 0 },
            { nid: 2, x: 90, y: 0, radius: 0, halfWidth: 10, halfHeight: 10, flags: 0 },
            { nid: 3, x: 40, y: 60, radius: 10, flags: 0 },
            { nid: 4, x: 65, y: 9, radius: 9, flags: 0 },
            { nid: 5, x: -18, y: -18, radius: 4, flags: 0 }
        ];
        for (let i = 0; i < bodies.length; i++) {
            trackBody(brute, bodies[i], 0);
            trackBody(indexed, bodies[i], 0);
        }
        brute.record(1, 100);
        indexed.record(1, 100);
        const ids = (samples) => samples.map(sample => sample.nid).sort((a, b) => a - b);
        const hitIds = (hits) => hits.map(hit => hit.sample.nid).sort((a, b) => a - b);
        expect(indexed.getStats()).toMatchObject({
            spatialIndex: 'grid'
        });
        expect(indexed.getStats().retainedIndexCells).toBeGreaterThan(0);
        expect(ids(indexed.queryCircleNearest(100, 0, 0, 35))).toEqual(ids(brute.queryCircleNearest(100, 0, 0, 35)));
        expect(ids(indexed.queryAabbNearest(100, 90, 20, 12, 12))).toEqual(ids(brute.queryAabbNearest(100, 90, 20, 12, 12)));
        expect(hitIds(indexed.queryRayNearest(100, 0, 0, 120, 0))).toEqual(hitIds(brute.queryRayNearest(100, 0, 0, 120, 0)));
        expect(hitIds(indexed.queryRayNearest(100, -25, -25, 0, 0))).toEqual(hitIds(brute.queryRayNearest(100, -25, -25, 0, 0)));
    });
    it('prunes old spatial frames and closed intervals by retention window', () => {
        var _a;
        const history = new Historian2D_1.Historian2D({ retentionMs: 100 });
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 0 };
        trackBody(history, body, 0);
        history.setFlag(1, 'shield', true, 10);
        history.setFlag(1, 'shield', false, 20);
        history.record(1, 0);
        history.record(2, 50);
        history.record(3, 150);
        expect((_a = history.getSpatialNearest(1, 0)) === null || _a === void 0 ? void 0 : _a.timeMs).toBe(50);
        expect(history.wasFlagActive(1, 'shield', 15)).toBe(false);
        expect(history.getStats()).toMatchObject({
            frames: 2,
            retainedSamples: 2,
            retainedValueIntervals: 1
        });
    });
});
