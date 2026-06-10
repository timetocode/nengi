"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Historian2D = void 0;
/**
 * Historian2D stores compact authoritative facts for gameplay rewind queries.
 * It intentionally does not decide fairness policy: game code chooses which
 * timestamp and facts matter for shots, shields, trades, or other resolution.
 */
class Historian2D {
    constructor(options) {
        this.spatialTrackers = new Map();
        this.frames = [];
        this.values = new Map();
        this.existence = new Map();
        this.latestTimeMs = 0;
        this.latestTick = 0;
        this.retentionMs = Math.max(0, options.retentionMs);
    }
    trackSpatial(target, options, timeMs) {
        const nid = this.readNumber(target, options.nid);
        this.spatialTrackers.set(nid, { target, options });
        if (timeMs !== undefined) {
            this.setExists(nid, true, timeMs);
        }
        return nid;
    }
    untrackSpatial(nid, timeMs) {
        this.spatialTrackers.delete(nid);
        if (timeMs !== undefined) {
            this.setExists(nid, false, timeMs);
        }
    }
    record(tick, timeMs) {
        const samples = new Map();
        const sampleList = [];
        this.spatialTrackers.forEach(tracker => {
            const sample = this.createSample(tracker, tick, timeMs);
            samples.set(sample.nid, sample);
            sampleList.push(sample);
        });
        this.frames.push({ tick, timeMs, samples, sampleList });
        this.latestTick = tick;
        this.latestTimeMs = timeMs;
        this.prune(timeMs);
    }
    setExists(nid, exists, timeMs) {
        this.setIntervalValue(this.existence, nid, exists, timeMs);
    }
    existsAt(nid, timeMs) {
        const intervals = this.existence.get(nid);
        if (!intervals) {
            return undefined;
        }
        return this.getIntervalValue(intervals, timeMs) === true;
    }
    setValue(nid, key, value, timeMs) {
        let byKey = this.values.get(nid);
        if (!byKey) {
            byKey = new Map();
            this.values.set(nid, byKey);
        }
        this.setIntervalValue(byKey, key, value, timeMs);
    }
    getValue(nid, key, timeMs) {
        var _a;
        const intervals = (_a = this.values.get(nid)) === null || _a === void 0 ? void 0 : _a.get(key);
        if (!intervals) {
            return undefined;
        }
        return this.getIntervalValue(intervals, timeMs);
    }
    setFlag(nid, key, active, timeMs) {
        this.setValue(nid, key, active, timeMs);
    }
    wasFlagActive(nid, key, timeMs) {
        return this.getValue(nid, key, timeMs) === true;
    }
    getSpatialNearest(nid, timeMs) {
        const frame = this.getNearestFrame(timeMs);
        if (!frame) {
            return null;
        }
        const sample = frame.samples.get(nid) || null;
        if (!sample || !this.isExistingAt(sample.nid, timeMs)) {
            return null;
        }
        return sample;
    }
    getSpatialInterpolated(nid, timeMs) {
        const pair = this.getSurroundingFrames(timeMs);
        if (!pair.older && !pair.newer) {
            return null;
        }
        if (!pair.older || !pair.newer || pair.older === pair.newer) {
            return this.getSpatialNearest(nid, timeMs);
        }
        const older = pair.older.samples.get(nid);
        const newer = pair.newer.samples.get(nid);
        if (!older || !newer || !this.isExistingAt(nid, timeMs)) {
            return this.getSpatialNearest(nid, timeMs);
        }
        const span = pair.newer.timeMs - pair.older.timeMs;
        const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (timeMs - pair.older.timeMs) / span));
        return this.interpolateSample(older, newer, timeMs, t);
    }
    queryCircleNearest(timeMs, x, y, radius) {
        const frame = this.getNearestFrame(timeMs);
        if (!frame) {
            return [];
        }
        const results = [];
        for (let i = 0; i < frame.sampleList.length; i++) {
            const sample = frame.sampleList[i];
            if (this.isExistingAt(sample.nid, timeMs) && this.circleIntersectsSample(x, y, radius, sample)) {
                results.push(sample);
            }
        }
        return results;
    }
    queryAabbNearest(timeMs, x, y, halfWidth, halfHeight) {
        const frame = this.getNearestFrame(timeMs);
        if (!frame) {
            return [];
        }
        const results = [];
        for (let i = 0; i < frame.sampleList.length; i++) {
            const sample = frame.sampleList[i];
            if (this.isExistingAt(sample.nid, timeMs) && this.aabbIntersectsSample(x, y, halfWidth, halfHeight, sample)) {
                results.push(sample);
            }
        }
        return results;
    }
    queryRayNearest(timeMs, fromX, fromY, toX, toY) {
        const frame = this.getNearestFrame(timeMs);
        if (!frame) {
            return [];
        }
        const results = [];
        // This is intentionally a full-frame scan for now. If this path gains
        // a spatial broadphase, the query must cover the whole ray segment A->B.
        for (let i = 0; i < frame.sampleList.length; i++) {
            const sample = frame.sampleList[i];
            if (!this.isExistingAt(sample.nid, timeMs)) {
                continue;
            }
            const t = this.rayHitsSample(fromX, fromY, toX, toY, sample);
            if (t !== null) {
                results.push({
                    sample,
                    t,
                    distance: Math.hypot(toX - fromX, toY - fromY) * t
                });
            }
        }
        results.sort((a, b) => a.t - b.t);
        return results;
    }
    queryRayInterpolated(timeMs, fromX, fromY, toX, toY) {
        const pair = this.getSurroundingFrames(timeMs);
        if (!pair.older && !pair.newer) {
            return [];
        }
        if (!pair.older || !pair.newer || pair.older === pair.newer) {
            return this.queryRayNearest(timeMs, fromX, fromY, toX, toY);
        }
        const span = pair.newer.timeMs - pair.older.timeMs;
        const alpha = span <= 0 ? 0 : Math.max(0, Math.min(1, (timeMs - pair.older.timeMs) / span));
        const seen = new Set();
        const results = [];
        const testSample = (sample) => {
            if (!this.isExistingAt(sample.nid, timeMs)) {
                return;
            }
            const t = this.rayHitsSample(fromX, fromY, toX, toY, sample);
            if (t !== null) {
                results.push({
                    sample,
                    t,
                    distance: Math.hypot(toX - fromX, toY - fromY) * t
                });
            }
        };
        pair.older.samples.forEach((older, nid) => {
            seen.add(nid);
            const newer = pair.newer.samples.get(nid);
            testSample(newer ? this.interpolateSample(older, newer, timeMs, alpha) : older);
        });
        pair.newer.samples.forEach((newer, nid) => {
            if (!seen.has(nid)) {
                testSample(newer);
            }
        });
        results.sort((a, b) => a.t - b.t);
        return results;
    }
    getStats() {
        let retainedSamples = 0;
        for (let i = 0; i < this.frames.length; i++) {
            retainedSamples += this.frames[i].sampleList.length;
        }
        let retainedValueIntervals = 0;
        this.values.forEach(byKey => {
            byKey.forEach(intervals => {
                retainedValueIntervals += intervals.length;
            });
        });
        let retainedExistenceIntervals = 0;
        this.existence.forEach(intervals => {
            retainedExistenceIntervals += intervals.length;
        });
        return {
            latestTick: this.latestTick,
            latestTimeMs: this.latestTimeMs,
            trackedSpatial: this.spatialTrackers.size,
            frames: this.frames.length,
            retainedSamples,
            retainedValueIntervals,
            retainedExistenceIntervals
        };
    }
    createSample(tracker, tick, timeMs) {
        const { target, options } = tracker;
        const sample = {
            nid: this.readNumber(target, options.nid),
            tick,
            timeMs,
            x: this.readNumber(target, options.x),
            y: this.readNumber(target, options.y)
        };
        if (options.radius !== undefined) {
            sample.radius = Math.max(0, this.readNumber(target, options.radius));
        }
        if (options.halfWidth !== undefined) {
            sample.halfWidth = Math.max(0, this.readNumber(target, options.halfWidth));
        }
        if (options.halfHeight !== undefined) {
            sample.halfHeight = Math.max(0, this.readNumber(target, options.halfHeight));
        }
        if (options.flags !== undefined) {
            sample.flags = this.readNumber(target, options.flags);
        }
        return sample;
    }
    interpolateSample(a, b, timeMs, t) {
        const sample = {
            nid: a.nid,
            tick: t < 0.5 ? a.tick : b.tick,
            timeMs,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
        };
        if (a.radius !== undefined && b.radius !== undefined) {
            sample.radius = a.radius + (b.radius - a.radius) * t;
        }
        if (a.halfWidth !== undefined && b.halfWidth !== undefined) {
            sample.halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
        }
        if (a.halfHeight !== undefined && b.halfHeight !== undefined) {
            sample.halfHeight = a.halfHeight + (b.halfHeight - a.halfHeight) * t;
        }
        sample.flags = t < 0.5 ? a.flags : b.flags;
        return sample;
    }
    readNumber(target, source) {
        if (typeof source === 'number') {
            return source;
        }
        if (typeof source === 'function') {
            return source(target);
        }
        return Number(target[source]);
    }
    setIntervalValue(store, id, value, timeMs) {
        const map = store;
        let intervals = map.get(id);
        if (!intervals) {
            intervals = [];
            map.set(id, intervals);
        }
        const last = intervals[intervals.length - 1];
        if (last && last.endMs === null) {
            if (last.value === value) {
                return;
            }
            last.endMs = timeMs;
        }
        intervals.push({ startMs: timeMs, endMs: null, value });
    }
    getIntervalValue(intervals, timeMs) {
        for (let i = intervals.length - 1; i >= 0; i--) {
            const interval = intervals[i];
            if (timeMs >= interval.startMs && (interval.endMs === null || timeMs < interval.endMs)) {
                return interval.value;
            }
        }
        return undefined;
    }
    isExistingAt(nid, timeMs) {
        const intervals = this.existence.get(nid);
        if (!intervals) {
            return true;
        }
        return this.getIntervalValue(intervals, timeMs) === true;
    }
    getNearestFrame(timeMs) {
        if (this.frames.length === 0) {
            return null;
        }
        const index = this.findFrameIndexAtOrAfter(timeMs);
        if (index === 0) {
            return this.frames[0];
        }
        if (index >= this.frames.length) {
            return this.frames[this.frames.length - 1];
        }
        const older = this.frames[index - 1];
        const newer = this.frames[index];
        return (timeMs - older.timeMs) <= (newer.timeMs - timeMs) ? older : newer;
    }
    getSurroundingFrames(timeMs) {
        if (this.frames.length === 0) {
            return { older: null, newer: null };
        }
        const index = this.findFrameIndexAtOrAfter(timeMs);
        if (index === 0) {
            return { older: this.frames[0], newer: this.frames[0] };
        }
        if (index >= this.frames.length) {
            const frame = this.frames[this.frames.length - 1];
            return { older: frame, newer: frame };
        }
        return { older: this.frames[index - 1], newer: this.frames[index] };
    }
    findFrameIndexAtOrAfter(timeMs) {
        let low = 0;
        let high = this.frames.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (this.frames[mid].timeMs < timeMs) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    prune(timeMs) {
        const cutoff = timeMs - this.retentionMs;
        while (this.frames.length > 0 && this.frames[0].timeMs < cutoff) {
            this.frames.shift();
        }
        this.pruneValueStore(this.values, cutoff);
        this.pruneIntervalMap(this.existence, cutoff);
    }
    pruneValueStore(store, cutoff) {
        store.forEach((byKey, nid) => {
            byKey.forEach((intervals, key) => {
                this.pruneIntervals(intervals, cutoff);
                if (intervals.length === 0) {
                    byKey.delete(key);
                }
            });
            if (byKey.size === 0) {
                store.delete(nid);
            }
        });
    }
    pruneIntervalMap(store, cutoff) {
        store.forEach((intervals, nid) => {
            this.pruneIntervals(intervals, cutoff);
            if (intervals.length === 0) {
                store.delete(nid);
            }
        });
    }
    pruneIntervals(intervals, cutoff) {
        let removeCount = 0;
        while (removeCount < intervals.length) {
            const interval = intervals[removeCount];
            if (interval.endMs === null || interval.endMs >= cutoff) {
                break;
            }
            removeCount++;
        }
        if (removeCount > 0) {
            intervals.splice(0, removeCount);
        }
    }
    circleIntersectsSample(x, y, radius, sample) {
        var _a;
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined) {
            return circleIntersectsAabb(x, y, radius, sample.x, sample.y, sample.halfWidth, sample.halfHeight);
        }
        const sampleRadius = (_a = sample.radius) !== null && _a !== void 0 ? _a : 0;
        const totalRadius = radius + sampleRadius;
        return distanceSquared(x, y, sample.x, sample.y) <= totalRadius * totalRadius;
    }
    aabbIntersectsSample(x, y, halfWidth, halfHeight, sample) {
        var _a;
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined) {
            return aabbIntersectsAabb(x, y, halfWidth, halfHeight, sample.x, sample.y, sample.halfWidth, sample.halfHeight);
        }
        const sampleRadius = (_a = sample.radius) !== null && _a !== void 0 ? _a : 0;
        return circleIntersectsAabb(sample.x, sample.y, sampleRadius, x, y, halfWidth, halfHeight);
    }
    rayHitsSample(fromX, fromY, toX, toY, sample) {
        var _a;
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined) {
            return rayHitsAabb(fromX, fromY, toX, toY, sample.x, sample.y, sample.halfWidth, sample.halfHeight);
        }
        return rayHitsCircle(fromX, fromY, toX, toY, sample.x, sample.y, (_a = sample.radius) !== null && _a !== void 0 ? _a : 0);
    }
}
exports.Historian2D = Historian2D;
function distanceSquared(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}
function circleIntersectsAabb(circleX, circleY, radius, boxX, boxY, halfWidth, halfHeight) {
    const closestX = clamp(circleX, boxX - halfWidth, boxX + halfWidth);
    const closestY = clamp(circleY, boxY - halfHeight, boxY + halfHeight);
    return distanceSquared(circleX, circleY, closestX, closestY) <= radius * radius;
}
function aabbIntersectsAabb(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
    return Math.abs(ax - bx) <= ahw + bhw && Math.abs(ay - by) <= ahh + bhh;
}
function rayHitsCircle(fromX, fromY, toX, toY, circleX, circleY, radius) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
        return distanceSquared(fromX, fromY, circleX, circleY) <= radius * radius ? 0 : null;
    }
    const fx = fromX - circleX;
    const fy = fromY - circleY;
    const a = lengthSq;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return null;
    }
    const sqrt = Math.sqrt(discriminant);
    const t1 = (-b - sqrt) / (2 * a);
    const t2 = (-b + sqrt) / (2 * a);
    if (t1 >= 0 && t1 <= 1) {
        return t1;
    }
    if (t2 >= 0 && t2 <= 1) {
        return t2;
    }
    return null;
}
function rayHitsAabb(fromX, fromY, toX, toY, boxX, boxY, halfWidth, halfHeight) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    let tMin = 0;
    let tMax = 1;
    const xResult = clipRayAxis(fromX, dx, boxX - halfWidth, boxX + halfWidth, tMin, tMax);
    if (!xResult) {
        return null;
    }
    tMin = xResult.tMin;
    tMax = xResult.tMax;
    const yResult = clipRayAxis(fromY, dy, boxY - halfHeight, boxY + halfHeight, tMin, tMax);
    if (!yResult) {
        return null;
    }
    return yResult.tMin;
}
function clipRayAxis(start, delta, min, max, tMin, tMax) {
    if (delta === 0) {
        return start >= min && start <= max ? { tMin, tMax } : null;
    }
    const inv = 1 / delta;
    let t1 = (min - start) * inv;
    let t2 = (max - start) * inv;
    if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax ? { tMin, tMax } : null;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
