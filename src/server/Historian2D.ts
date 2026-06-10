export type HistorianValue = boolean | number | string

export type Historian2DOptions = {
    retentionMs: number
}

type ValueSource<T, TValue> = keyof T | TValue | ((target: T) => TValue)

export type HistorianSpatialTrackOptions<T extends object> = {
    nid: ValueSource<T, number>
    x: ValueSource<T, number>
    y: ValueSource<T, number>
    radius?: ValueSource<T, number>
    halfWidth?: ValueSource<T, number>
    halfHeight?: ValueSource<T, number>
    flags?: ValueSource<T, number>
}

export type HistorianSpatialSample2D = {
    nid: number
    tick: number
    timeMs: number
    x: number
    y: number
    radius?: number
    halfWidth?: number
    halfHeight?: number
    flags?: number
}

export type HistorianRayHit2D = {
    sample: HistorianSpatialSample2D
    t: number
    distance: number
}

type SpatialTracker<T extends object> = {
    target: T
    options: HistorianSpatialTrackOptions<T>
}

type SpatialFrame2D = {
    tick: number
    timeMs: number
    samples: Map<number, HistorianSpatialSample2D>
    sampleList: HistorianSpatialSample2D[]
}

type ValueInterval = {
    startMs: number
    endMs: number | null
    value: HistorianValue
}

/**
 * Historian2D stores compact authoritative facts for gameplay rewind queries.
 * It intentionally does not decide fairness policy: game code chooses which
 * timestamp and facts matter for shots, shields, trades, or other resolution.
 */
export class Historian2D {
    retentionMs: number
    private spatialTrackers = new Map<number, SpatialTracker<any>>()
    private frames: SpatialFrame2D[] = []
    private values = new Map<number, Map<string, ValueInterval[]>>()
    private existence = new Map<number, ValueInterval[]>()
    private latestTimeMs = 0
    private latestTick = 0

    constructor(options: Historian2DOptions) {
        this.retentionMs = Math.max(0, options.retentionMs)
    }

    trackSpatial<T extends object>(target: T, options: HistorianSpatialTrackOptions<T>, timeMs?: number) {
        const nid = this.readNumber(target, options.nid)
        this.spatialTrackers.set(nid, { target, options })
        if (timeMs !== undefined) {
            this.setExists(nid, true, timeMs)
        }
        return nid
    }

    untrackSpatial(nid: number, timeMs?: number) {
        this.spatialTrackers.delete(nid)
        if (timeMs !== undefined) {
            this.setExists(nid, false, timeMs)
        }
    }

    record(tick: number, timeMs: number) {
        const samples = new Map<number, HistorianSpatialSample2D>()
        const sampleList: HistorianSpatialSample2D[] = []

        this.spatialTrackers.forEach(tracker => {
            const sample = this.createSample(tracker, tick, timeMs)
            samples.set(sample.nid, sample)
            sampleList.push(sample)
        })

        this.frames.push({ tick, timeMs, samples, sampleList })
        this.latestTick = tick
        this.latestTimeMs = timeMs
        this.prune(timeMs)
    }

    setExists(nid: number, exists: boolean, timeMs: number) {
        this.setIntervalValue(this.existence, nid, exists, timeMs)
    }

    existsAt(nid: number, timeMs: number) {
        const intervals = this.existence.get(nid)
        if (!intervals) {
            return undefined
        }
        return this.getIntervalValue(intervals, timeMs) === true
    }

    setValue(nid: number, key: string, value: HistorianValue, timeMs: number) {
        let byKey = this.values.get(nid)
        if (!byKey) {
            byKey = new Map()
            this.values.set(nid, byKey)
        }
        this.setIntervalValue(byKey, key, value, timeMs)
    }

    getValue(nid: number, key: string, timeMs: number) {
        const intervals = this.values.get(nid)?.get(key)
        if (!intervals) {
            return undefined
        }
        return this.getIntervalValue(intervals, timeMs)
    }

    setFlag(nid: number, key: string, active: boolean, timeMs: number) {
        this.setValue(nid, key, active, timeMs)
    }

    wasFlagActive(nid: number, key: string, timeMs: number) {
        return this.getValue(nid, key, timeMs) === true
    }

    getSpatialNearest(nid: number, timeMs: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return null
        }
        const sample = frame.samples.get(nid) || null
        if (!sample || !this.isExistingAt(sample.nid, timeMs)) {
            return null
        }
        return sample
    }

    getSpatialInterpolated(nid: number, timeMs: number) {
        const pair = this.getSurroundingFrames(timeMs)
        if (!pair.older && !pair.newer) {
            return null
        }

        if (!pair.older || !pair.newer || pair.older === pair.newer) {
            return this.getSpatialNearest(nid, timeMs)
        }

        const older = pair.older.samples.get(nid)
        const newer = pair.newer.samples.get(nid)
        if (!older || !newer || !this.isExistingAt(nid, timeMs)) {
            return this.getSpatialNearest(nid, timeMs)
        }

        const span = pair.newer.timeMs - pair.older.timeMs
        const t = span <= 0 ? 0 : Math.max(0, Math.min(1, (timeMs - pair.older.timeMs) / span))
        return this.interpolateSample(older, newer, timeMs, t)
    }

    queryCircleNearest(timeMs: number, x: number, y: number, radius: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return []
        }
        const results: HistorianSpatialSample2D[] = []
        for (let i = 0; i < frame.sampleList.length; i++) {
            const sample = frame.sampleList[i]
            if (this.isExistingAt(sample.nid, timeMs) && this.circleIntersectsSample(x, y, radius, sample)) {
                results.push(sample)
            }
        }
        return results
    }

    queryAabbNearest(timeMs: number, x: number, y: number, halfWidth: number, halfHeight: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return []
        }
        const results: HistorianSpatialSample2D[] = []
        for (let i = 0; i < frame.sampleList.length; i++) {
            const sample = frame.sampleList[i]
            if (this.isExistingAt(sample.nid, timeMs) && this.aabbIntersectsSample(x, y, halfWidth, halfHeight, sample)) {
                results.push(sample)
            }
        }
        return results
    }

    queryRayNearest(timeMs: number, fromX: number, fromY: number, toX: number, toY: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return []
        }
        const results: HistorianRayHit2D[] = []
        // This is intentionally a full-frame scan for now. If this path gains
        // a spatial broadphase, the query must cover the whole ray segment A->B.
        for (let i = 0; i < frame.sampleList.length; i++) {
            const sample = frame.sampleList[i]
            if (!this.isExistingAt(sample.nid, timeMs)) {
                continue
            }
            const t = this.rayHitsSample(fromX, fromY, toX, toY, sample)
            if (t !== null) {
                results.push({
                    sample,
                    t,
                    distance: Math.hypot(toX - fromX, toY - fromY) * t
                })
            }
        }
        results.sort((a, b) => a.t - b.t)
        return results
    }

    queryRayInterpolated(timeMs: number, fromX: number, fromY: number, toX: number, toY: number) {
        const pair = this.getSurroundingFrames(timeMs)
        if (!pair.older && !pair.newer) {
            return []
        }
        if (!pair.older || !pair.newer || pair.older === pair.newer) {
            return this.queryRayNearest(timeMs, fromX, fromY, toX, toY)
        }

        const span = pair.newer.timeMs - pair.older.timeMs
        const alpha = span <= 0 ? 0 : Math.max(0, Math.min(1, (timeMs - pair.older.timeMs) / span))
        const seen = new Set<number>()
        const results: HistorianRayHit2D[] = []

        const testSample = (sample: HistorianSpatialSample2D) => {
            if (!this.isExistingAt(sample.nid, timeMs)) {
                return
            }
            const t = this.rayHitsSample(fromX, fromY, toX, toY, sample)
            if (t !== null) {
                results.push({
                    sample,
                    t,
                    distance: Math.hypot(toX - fromX, toY - fromY) * t
                })
            }
        }

        pair.older.samples.forEach((older, nid) => {
            seen.add(nid)
            const newer = pair.newer!.samples.get(nid)
            testSample(newer ? this.interpolateSample(older, newer, timeMs, alpha) : older)
        })
        pair.newer.samples.forEach((newer, nid) => {
            if (!seen.has(nid)) {
                testSample(newer)
            }
        })

        results.sort((a, b) => a.t - b.t)
        return results
    }

    getStats() {
        let retainedSamples = 0
        for (let i = 0; i < this.frames.length; i++) {
            retainedSamples += this.frames[i].sampleList.length
        }

        let retainedValueIntervals = 0
        this.values.forEach(byKey => {
            byKey.forEach(intervals => {
                retainedValueIntervals += intervals.length
            })
        })

        let retainedExistenceIntervals = 0
        this.existence.forEach(intervals => {
            retainedExistenceIntervals += intervals.length
        })

        return {
            latestTick: this.latestTick,
            latestTimeMs: this.latestTimeMs,
            trackedSpatial: this.spatialTrackers.size,
            frames: this.frames.length,
            retainedSamples,
            retainedValueIntervals,
            retainedExistenceIntervals
        }
    }

    private createSample(tracker: SpatialTracker<any>, tick: number, timeMs: number): HistorianSpatialSample2D {
        const { target, options } = tracker
        const sample: HistorianSpatialSample2D = {
            nid: this.readNumber(target, options.nid),
            tick,
            timeMs,
            x: this.readNumber(target, options.x),
            y: this.readNumber(target, options.y)
        }

        if (options.radius !== undefined) {
            sample.radius = Math.max(0, this.readNumber(target, options.radius))
        }
        if (options.halfWidth !== undefined) {
            sample.halfWidth = Math.max(0, this.readNumber(target, options.halfWidth))
        }
        if (options.halfHeight !== undefined) {
            sample.halfHeight = Math.max(0, this.readNumber(target, options.halfHeight))
        }
        if (options.flags !== undefined) {
            sample.flags = this.readNumber(target, options.flags)
        }

        return sample
    }

    private interpolateSample(a: HistorianSpatialSample2D, b: HistorianSpatialSample2D, timeMs: number, t: number): HistorianSpatialSample2D {
        const sample: HistorianSpatialSample2D = {
            nid: a.nid,
            tick: t < 0.5 ? a.tick : b.tick,
            timeMs,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
        }

        if (a.radius !== undefined && b.radius !== undefined) {
            sample.radius = a.radius + (b.radius - a.radius) * t
        }
        if (a.halfWidth !== undefined && b.halfWidth !== undefined) {
            sample.halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t
        }
        if (a.halfHeight !== undefined && b.halfHeight !== undefined) {
            sample.halfHeight = a.halfHeight + (b.halfHeight - a.halfHeight) * t
        }
        sample.flags = t < 0.5 ? a.flags : b.flags
        return sample
    }

    private readNumber<T extends object>(target: T, source: ValueSource<T, number>) {
        if (typeof source === 'number') {
            return source
        }
        if (typeof source === 'function') {
            return source(target)
        }
        return Number(target[source])
    }

    private setIntervalValue(store: Map<number, ValueInterval[]> | Map<string, ValueInterval[]>, id: number | string, value: HistorianValue, timeMs: number) {
        const map = store as Map<number | string, ValueInterval[]>
        let intervals = map.get(id)
        if (!intervals) {
            intervals = []
            map.set(id, intervals)
        }

        const last = intervals[intervals.length - 1]
        if (last && last.endMs === null) {
            if (last.value === value) {
                return
            }
            last.endMs = timeMs
        }

        intervals.push({ startMs: timeMs, endMs: null, value })
    }

    private getIntervalValue(intervals: ValueInterval[], timeMs: number) {
        for (let i = intervals.length - 1; i >= 0; i--) {
            const interval = intervals[i]
            if (timeMs >= interval.startMs && (interval.endMs === null || timeMs < interval.endMs)) {
                return interval.value
            }
        }
        return undefined
    }

    private isExistingAt(nid: number, timeMs: number) {
        const intervals = this.existence.get(nid)
        if (!intervals) {
            return true
        }
        return this.getIntervalValue(intervals, timeMs) === true
    }

    private getNearestFrame(timeMs: number) {
        if (this.frames.length === 0) {
            return null
        }
        const index = this.findFrameIndexAtOrAfter(timeMs)
        if (index === 0) {
            return this.frames[0]
        }
        if (index >= this.frames.length) {
            return this.frames[this.frames.length - 1]
        }
        const older = this.frames[index - 1]
        const newer = this.frames[index]
        return (timeMs - older.timeMs) <= (newer.timeMs - timeMs) ? older : newer
    }

    private getSurroundingFrames(timeMs: number) {
        if (this.frames.length === 0) {
            return { older: null, newer: null }
        }
        const index = this.findFrameIndexAtOrAfter(timeMs)
        if (index === 0) {
            return { older: this.frames[0], newer: this.frames[0] }
        }
        if (index >= this.frames.length) {
            const frame = this.frames[this.frames.length - 1]
            return { older: frame, newer: frame }
        }
        return { older: this.frames[index - 1], newer: this.frames[index] }
    }

    private findFrameIndexAtOrAfter(timeMs: number) {
        let low = 0
        let high = this.frames.length
        while (low < high) {
            const mid = (low + high) >> 1
            if (this.frames[mid].timeMs < timeMs) {
                low = mid + 1
            } else {
                high = mid
            }
        }
        return low
    }

    private prune(timeMs: number) {
        const cutoff = timeMs - this.retentionMs
        while (this.frames.length > 0 && this.frames[0].timeMs < cutoff) {
            this.frames.shift()
        }
        this.pruneValueStore(this.values, cutoff)
        this.pruneIntervalMap(this.existence, cutoff)
    }

    private pruneValueStore(store: Map<number, Map<string, ValueInterval[]>>, cutoff: number) {
        store.forEach((byKey, nid) => {
            byKey.forEach((intervals, key) => {
                this.pruneIntervals(intervals, cutoff)
                if (intervals.length === 0) {
                    byKey.delete(key)
                }
            })
            if (byKey.size === 0) {
                store.delete(nid)
            }
        })
    }

    private pruneIntervalMap(store: Map<number, ValueInterval[]>, cutoff: number) {
        store.forEach((intervals, nid) => {
            this.pruneIntervals(intervals, cutoff)
            if (intervals.length === 0) {
                store.delete(nid)
            }
        })
    }

    private pruneIntervals(intervals: ValueInterval[], cutoff: number) {
        let removeCount = 0
        while (removeCount < intervals.length) {
            const interval = intervals[removeCount]
            if (interval.endMs === null || interval.endMs >= cutoff) {
                break
            }
            removeCount++
        }
        if (removeCount > 0) {
            intervals.splice(0, removeCount)
        }
    }

    private circleIntersectsSample(x: number, y: number, radius: number, sample: HistorianSpatialSample2D) {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined) {
            return circleIntersectsAabb(x, y, radius, sample.x, sample.y, sample.halfWidth, sample.halfHeight)
        }
        const sampleRadius = sample.radius ?? 0
        const totalRadius = radius + sampleRadius
        return distanceSquared(x, y, sample.x, sample.y) <= totalRadius * totalRadius
    }

    private aabbIntersectsSample(x: number, y: number, halfWidth: number, halfHeight: number, sample: HistorianSpatialSample2D) {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined) {
            return aabbIntersectsAabb(x, y, halfWidth, halfHeight, sample.x, sample.y, sample.halfWidth, sample.halfHeight)
        }
        const sampleRadius = sample.radius ?? 0
        return circleIntersectsAabb(sample.x, sample.y, sampleRadius, x, y, halfWidth, halfHeight)
    }

    private rayHitsSample(fromX: number, fromY: number, toX: number, toY: number, sample: HistorianSpatialSample2D) {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined) {
            return rayHitsAabb(fromX, fromY, toX, toY, sample.x, sample.y, sample.halfWidth, sample.halfHeight)
        }
        return rayHitsCircle(fromX, fromY, toX, toY, sample.x, sample.y, sample.radius ?? 0)
    }
}

function distanceSquared(ax: number, ay: number, bx: number, by: number) {
    const dx = ax - bx
    const dy = ay - by
    return dx * dx + dy * dy
}

function circleIntersectsAabb(circleX: number, circleY: number, radius: number, boxX: number, boxY: number, halfWidth: number, halfHeight: number) {
    const closestX = clamp(circleX, boxX - halfWidth, boxX + halfWidth)
    const closestY = clamp(circleY, boxY - halfHeight, boxY + halfHeight)
    return distanceSquared(circleX, circleY, closestX, closestY) <= radius * radius
}

function aabbIntersectsAabb(ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) {
    return Math.abs(ax - bx) <= ahw + bhw && Math.abs(ay - by) <= ahh + bhh
}

function rayHitsCircle(fromX: number, fromY: number, toX: number, toY: number, circleX: number, circleY: number, radius: number) {
    const dx = toX - fromX
    const dy = toY - fromY
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) {
        return distanceSquared(fromX, fromY, circleX, circleY) <= radius * radius ? 0 : null
    }

    const fx = fromX - circleX
    const fy = fromY - circleY
    const a = lengthSq
    const b = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - radius * radius
    const discriminant = b * b - 4 * a * c
    if (discriminant < 0) {
        return null
    }

    const sqrt = Math.sqrt(discriminant)
    const t1 = (-b - sqrt) / (2 * a)
    const t2 = (-b + sqrt) / (2 * a)
    if (t1 >= 0 && t1 <= 1) {
        return t1
    }
    if (t2 >= 0 && t2 <= 1) {
        return t2
    }
    return null
}

function rayHitsAabb(fromX: number, fromY: number, toX: number, toY: number, boxX: number, boxY: number, halfWidth: number, halfHeight: number) {
    const dx = toX - fromX
    const dy = toY - fromY
    let tMin = 0
    let tMax = 1

    const xResult = clipRayAxis(fromX, dx, boxX - halfWidth, boxX + halfWidth, tMin, tMax)
    if (!xResult) {
        return null
    }
    tMin = xResult.tMin
    tMax = xResult.tMax

    const yResult = clipRayAxis(fromY, dy, boxY - halfHeight, boxY + halfHeight, tMin, tMax)
    if (!yResult) {
        return null
    }
    return yResult.tMin
}

function clipRayAxis(start: number, delta: number, min: number, max: number, tMin: number, tMax: number) {
    if (delta === 0) {
        return start >= min && start <= max ? { tMin, tMax } : null
    }
    const inv = 1 / delta
    let t1 = (min - start) * inv
    let t2 = (max - start) * inv
    if (t1 > t2) {
        const swap = t1
        t1 = t2
        t2 = swap
    }
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    return tMin <= tMax ? { tMin, tMax } : null
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}
