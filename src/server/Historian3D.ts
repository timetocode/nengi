import type { HistorianValue } from './Historian2D'

export type Historian3DSpatialIndexOptions = 'none' | {
    type: 'grid'
    cellSize: number
}

export type Historian3DOptions = {
    retentionMs: number
    spatialIndex?: Historian3DSpatialIndexOptions
}

type ValueSource<T, TValue> = keyof T | TValue | ((target: T) => TValue)

export type HistorianSpatialTrackOptions3D<T extends object> = {
    nid: ValueSource<T, number>
    x: ValueSource<T, number>
    y: ValueSource<T, number>
    z: ValueSource<T, number>
    radius?: ValueSource<T, number>
    halfWidth?: ValueSource<T, number>
    halfHeight?: ValueSource<T, number>
    halfDepth?: ValueSource<T, number>
    flags?: ValueSource<T, number>
}

export type HistorianSpatialSourceOptions3D<T extends object> = Omit<HistorianSpatialTrackOptions3D<T>, 'nid'>

export type HistorianSpatialSample3D = {
    nid: number
    tick: number
    timeMs: number
    x: number
    y: number
    z: number
    radius?: number
    halfWidth?: number
    halfHeight?: number
    halfDepth?: number
    flags?: number
}

export type HistorianSpatialSampleInput3D = Omit<HistorianSpatialSample3D, 'tick' | 'timeMs'>

export type HistorianRayHit3D = {
    sample: HistorianSpatialSample3D
    t: number
    distance: number
}

type SpatialTracker<T extends object> = {
    target: T
    options: HistorianSpatialTrackOptions3D<T>
}

type SpatialFrame3D = {
    tick: number
    timeMs: number
    samples: Map<number, HistorianSpatialSample3D>
    sampleList: HistorianSpatialSample3D[]
    index: SpatialFrameIndex3D | null
}

type SpatialFrameIndex3D = {
    type: 'grid'
    cellSize: number
    cells: Map<string, HistorianSpatialSample3D[]>
    cellCount: number
}

type Bounds3D = {
    minX: number
    minY: number
    minZ: number
    maxX: number
    maxY: number
    maxZ: number
}

type ValueInterval = {
    startMs: number
    endMs: number | null
    value: HistorianValue
}

/**
 * Historian3D stores compact authoritative facts for gameplay rewind queries.
 * It intentionally does not decide fairness policy: game code chooses which
 * timestamp and facts matter for shots, shields, trades, or other resolution.
 *
 * Historical existence and current game existence are different concepts. A
 * query may return a copied sample for an object that userland has already
 * deleted from current authoritative state. Games that need death trades,
 * delayed cleanup, revive windows, or corpse interactions should model those as
 * game state and delete later; the historian should not keep entities alive.
 */
export class Historian3D {
    retentionMs: number
    private spatialTrackers = new Map<number, SpatialTracker<any>>()
    private pendingSpatialSamples: HistorianSpatialSampleInput3D[] = []
    private frames: SpatialFrame3D[] = []
    private values = new Map<number, Map<string, ValueInterval[]>>()
    private existence = new Map<number, ValueInterval[]>()
    private latestTimeMs = 0
    private latestTick = 0
    private spatialIndex: Historian3DSpatialIndexOptions = 'none'

    constructor(options: Historian3DOptions) {
        this.retentionMs = Math.max(0, options.retentionMs)
        if (options.spatialIndex && options.spatialIndex !== 'none') {
            this.spatialIndex = {
                type: 'grid',
                cellSize: Math.max(1, options.spatialIndex.cellSize)
            }
        }
    }

    /**
     * Track a normal spatial object whose gameplay identity and position live
     * on the same object.
     *
     * This is the basic/plain-channel shape:
     *
     *     history.trackSpatial(player, { nid: 'nid', x: 'x', y: 'y', z: 'z' })
     *
     * Query results return `sample.nid`, so choose `nid` as the id that later
     * gameplay should act on.
     */
    trackSpatial<T extends object>(target: T, options: HistorianSpatialTrackOptions3D<T>, timeMs?: number) {
        const nid = this.readNumber(target, options.nid)
        this.spatialTrackers.set(nid, { target, options })
        this.setExists(nid, true, this.resolveTime(timeMs))
        return nid
    }

    /**
     * Track a spatial source under an explicit gameplay identity.
     *
     * This is useful for ECS or other composed models where the thing hit by a
     * query is not the same object that owns position. For example, an NPC may
     * be the damageable component while a Transform component supplies x/y/z:
     *
     *     history.trackSpatialTarget(npc.nid, transform, { x: 'x', y: 'y', z: 'z' })
     *
     * Query results return the explicit target nid (`npc.nid` above), while
     * recorded spatial values are read from `source`.
     */
    trackSpatialTarget<T extends object>(nid: number, source: T, options: HistorianSpatialSourceOptions3D<T>, timeMs?: number) {
        return this.trackSpatial(source, { ...options, nid }, timeMs)
    }

    untrackSpatial(nid: number, timeMs?: number) {
        this.spatialTrackers.delete(nid)
        this.setExists(nid, false, this.resolveTime(timeMs))
    }

    recordSpatialSample(sample: HistorianSpatialSampleInput3D) {
        this.pendingSpatialSamples.push(this.copySpatialSampleInput(sample))
    }

    recordSpatialSamples(samples: HistorianSpatialSampleInput3D[]) {
        for (let i = 0; i < samples.length; i++) {
            this.recordSpatialSample(samples[i])
        }
    }

    record(tick: number, timeMs: number) {
        const samples = new Map<number, HistorianSpatialSample3D>()

        this.spatialTrackers.forEach(tracker => {
            const sample = this.createSample(tracker, tick, timeMs)
            samples.set(sample.nid, sample)
        })

        for (let i = 0; i < this.pendingSpatialSamples.length; i++) {
            const sample = this.completeSpatialSample(this.pendingSpatialSamples[i], tick, timeMs)
            samples.set(sample.nid, sample)
        }
        this.pendingSpatialSamples.length = 0

        const sampleList = Array.from(samples.values())
        this.frames.push({
            tick,
            timeMs,
            samples,
            sampleList,
            index: this.createFrameIndex(sampleList)
        })
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

    querySphereNearest(timeMs: number, x: number, y: number, z: number, radius: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return []
        }
        const results: HistorianSpatialSample3D[] = []
        const candidates = this.getFrameCandidates(frame, {
            minX: x - radius,
            minY: y - radius,
            minZ: z - radius,
            maxX: x + radius,
            maxY: y + radius,
            maxZ: z + radius
        })
        for (let i = 0; i < candidates.length; i++) {
            const sample = candidates[i]
            if (this.isExistingAt(sample.nid, timeMs) && this.sphereIntersectsSample(x, y, z, radius, sample)) {
                results.push(sample)
            }
        }
        return results
    }

    queryAabbNearest(timeMs: number, x: number, y: number, z: number, halfWidth: number, halfHeight: number, halfDepth: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return []
        }
        const results: HistorianSpatialSample3D[] = []
        const candidates = this.getFrameCandidates(frame, {
            minX: x - halfWidth,
            minY: y - halfHeight,
            minZ: z - halfDepth,
            maxX: x + halfWidth,
            maxY: y + halfHeight,
            maxZ: z + halfDepth
        })
        for (let i = 0; i < candidates.length; i++) {
            const sample = candidates[i]
            if (this.isExistingAt(sample.nid, timeMs) && this.aabbIntersectsSample(x, y, z, halfWidth, halfHeight, halfDepth, sample)) {
                results.push(sample)
            }
        }
        return results
    }

    queryRayNearest(timeMs: number, fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number) {
        const frame = this.getNearestFrame(timeMs)
        if (!frame) {
            return []
        }
        const results: HistorianRayHit3D[] = []
        const candidates = this.getFrameCandidates(frame, {
            minX: Math.min(fromX, toX),
            minY: Math.min(fromY, toY),
            minZ: Math.min(fromZ, toZ),
            maxX: Math.max(fromX, toX),
            maxY: Math.max(fromY, toY),
            maxZ: Math.max(fromZ, toZ)
        })
        for (let i = 0; i < candidates.length; i++) {
            const sample = candidates[i]
            if (!this.isExistingAt(sample.nid, timeMs)) {
                continue
            }
            const t = this.rayHitsSample(fromX, fromY, fromZ, toX, toY, toZ, sample)
            if (t !== null) {
                results.push({
                    sample,
                    t,
                    distance: distance3D(fromX, fromY, fromZ, toX, toY, toZ) * t
                })
            }
        }
        results.sort((a, b) => a.t - b.t)
        return results
    }

    queryRayInterpolated(timeMs: number, fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number) {
        const pair = this.getSurroundingFrames(timeMs)
        if (!pair.older && !pair.newer) {
            return []
        }
        if (!pair.older || !pair.newer || pair.older === pair.newer) {
            return this.queryRayNearest(timeMs, fromX, fromY, fromZ, toX, toY, toZ)
        }

        const span = pair.newer.timeMs - pair.older.timeMs
        const alpha = span <= 0 ? 0 : Math.max(0, Math.min(1, (timeMs - pair.older.timeMs) / span))
        const seen = new Set<number>()
        const results: HistorianRayHit3D[] = []

        const testSample = (sample: HistorianSpatialSample3D) => {
            if (!this.isExistingAt(sample.nid, timeMs)) {
                return
            }
            const t = this.rayHitsSample(fromX, fromY, fromZ, toX, toY, toZ, sample)
            if (t !== null) {
                results.push({
                    sample,
                    t,
                    distance: distance3D(fromX, fromY, fromZ, toX, toY, toZ) * t
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
            pendingSpatialSamples: this.pendingSpatialSamples.length,
            spatialIndex: this.spatialIndex === 'none' ? 'none' : this.spatialIndex.type,
            frames: this.frames.length,
            retainedSamples,
            retainedValueIntervals,
            retainedExistenceIntervals,
            retainedIndexCells: this.countRetainedIndexCells()
        }
    }

    private copySpatialSampleInput(input: HistorianSpatialSampleInput3D): HistorianSpatialSampleInput3D {
        const sample: HistorianSpatialSampleInput3D = {
            nid: input.nid,
            x: input.x,
            y: input.y,
            z: input.z
        }
        if (input.radius !== undefined) {
            sample.radius = Math.max(0, input.radius)
        }
        if (input.halfWidth !== undefined) {
            sample.halfWidth = Math.max(0, input.halfWidth)
        }
        if (input.halfHeight !== undefined) {
            sample.halfHeight = Math.max(0, input.halfHeight)
        }
        if (input.halfDepth !== undefined) {
            sample.halfDepth = Math.max(0, input.halfDepth)
        }
        if (input.flags !== undefined) {
            sample.flags = input.flags
        }
        return sample
    }

    private completeSpatialSample(input: HistorianSpatialSampleInput3D, tick: number, timeMs: number): HistorianSpatialSample3D {
        return {
            ...this.copySpatialSampleInput(input),
            tick,
            timeMs
        }
    }

    private createSample(tracker: SpatialTracker<any>, tick: number, timeMs: number): HistorianSpatialSample3D {
        const { target, options } = tracker
        const sample: HistorianSpatialSample3D = {
            nid: this.readNumber(target, options.nid),
            tick,
            timeMs,
            x: this.readNumber(target, options.x),
            y: this.readNumber(target, options.y),
            z: this.readNumber(target, options.z)
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
        if (options.halfDepth !== undefined) {
            sample.halfDepth = Math.max(0, this.readNumber(target, options.halfDepth))
        }
        if (options.flags !== undefined) {
            sample.flags = this.readNumber(target, options.flags)
        }

        return sample
    }

    private createFrameIndex(samples: HistorianSpatialSample3D[]): SpatialFrameIndex3D | null {
        if (this.spatialIndex === 'none') {
            return null
        }
        const cellSize = this.spatialIndex.cellSize
        const cells = new Map<string, HistorianSpatialSample3D[]>()
        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i]
            const bounds = this.getSampleBounds(sample)
            const minCellX = Math.floor(bounds.minX / cellSize)
            const maxCellX = Math.floor(bounds.maxX / cellSize)
            const minCellY = Math.floor(bounds.minY / cellSize)
            const maxCellY = Math.floor(bounds.maxY / cellSize)
            const minCellZ = Math.floor(bounds.minZ / cellSize)
            const maxCellZ = Math.floor(bounds.maxZ / cellSize)
            for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
                for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
                    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                        const key = `${cellX},${cellY},${cellZ}`
                        let bucket = cells.get(key)
                        if (!bucket) {
                            bucket = []
                            cells.set(key, bucket)
                        }
                        bucket.push(sample)
                    }
                }
            }
        }
        return {
            type: 'grid',
            cellSize,
            cells,
            cellCount: cells.size
        }
    }

    private getFrameCandidates(frame: SpatialFrame3D, bounds: Bounds3D) {
        if (!frame.index) {
            return frame.sampleList
        }

        const cellSize = frame.index.cellSize
        const minCellX = Math.floor(bounds.minX / cellSize)
        const maxCellX = Math.floor(bounds.maxX / cellSize)
        const minCellY = Math.floor(bounds.minY / cellSize)
        const maxCellY = Math.floor(bounds.maxY / cellSize)
        const minCellZ = Math.floor(bounds.minZ / cellSize)
        const maxCellZ = Math.floor(bounds.maxZ / cellSize)
        const results: HistorianSpatialSample3D[] = []
        const seen = new Set<number>()

        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
            for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
                for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                    const bucket = frame.index.cells.get(`${cellX},${cellY},${cellZ}`)
                    if (!bucket) {
                        continue
                    }
                    for (let i = 0; i < bucket.length; i++) {
                        const sample = bucket[i]
                        if (!seen.has(sample.nid)) {
                            seen.add(sample.nid)
                            results.push(sample)
                        }
                    }
                }
            }
        }
        return results
    }

    private getSampleBounds(sample: HistorianSpatialSample3D): Bounds3D {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined && sample.halfDepth !== undefined) {
            return {
                minX: sample.x - sample.halfWidth,
                minY: sample.y - sample.halfHeight,
                minZ: sample.z - sample.halfDepth,
                maxX: sample.x + sample.halfWidth,
                maxY: sample.y + sample.halfHeight,
                maxZ: sample.z + sample.halfDepth
            }
        }
        const radius = sample.radius ?? 0
        return {
            minX: sample.x - radius,
            minY: sample.y - radius,
            minZ: sample.z - radius,
            maxX: sample.x + radius,
            maxY: sample.y + radius,
            maxZ: sample.z + radius
        }
    }

    private countRetainedIndexCells() {
        let count = 0
        for (let i = 0; i < this.frames.length; i++) {
            count += this.frames[i].index?.cellCount ?? 0
        }
        return count
    }

    private interpolateSample(a: HistorianSpatialSample3D, b: HistorianSpatialSample3D, timeMs: number, t: number): HistorianSpatialSample3D {
        const sample: HistorianSpatialSample3D = {
            nid: a.nid,
            tick: t < 0.5 ? a.tick : b.tick,
            timeMs,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t
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
        if (a.halfDepth !== undefined && b.halfDepth !== undefined) {
            sample.halfDepth = a.halfDepth + (b.halfDepth - a.halfDepth) * t
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

    private sphereIntersectsSample(x: number, y: number, z: number, radius: number, sample: HistorianSpatialSample3D) {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined && sample.halfDepth !== undefined) {
            return sphereIntersectsAabb(x, y, z, radius, sample.x, sample.y, sample.z, sample.halfWidth, sample.halfHeight, sample.halfDepth)
        }
        const sampleRadius = sample.radius ?? 0
        const totalRadius = radius + sampleRadius
        return distanceSquared3D(x, y, z, sample.x, sample.y, sample.z) <= totalRadius * totalRadius
    }

    private aabbIntersectsSample(x: number, y: number, z: number, halfWidth: number, halfHeight: number, halfDepth: number, sample: HistorianSpatialSample3D) {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined && sample.halfDepth !== undefined) {
            return aabbIntersectsAabb(x, y, z, halfWidth, halfHeight, halfDepth, sample.x, sample.y, sample.z, sample.halfWidth, sample.halfHeight, sample.halfDepth)
        }
        const sampleRadius = sample.radius ?? 0
        return sphereIntersectsAabb(sample.x, sample.y, sample.z, sampleRadius, x, y, z, halfWidth, halfHeight, halfDepth)
    }

    private rayHitsSample(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, sample: HistorianSpatialSample3D) {
        if (sample.halfWidth !== undefined && sample.halfHeight !== undefined && sample.halfDepth !== undefined) {
            return rayHitsAabb(fromX, fromY, fromZ, toX, toY, toZ, sample.x, sample.y, sample.z, sample.halfWidth, sample.halfHeight, sample.halfDepth)
        }
        return rayHitsSphere(fromX, fromY, fromZ, toX, toY, toZ, sample.x, sample.y, sample.z, sample.radius ?? 0)
    }

    private resolveTime(timeMs?: number) {
        return timeMs ?? this.latestTimeMs
    }
}

function distanceSquared3D(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = ax - bx
    const dy = ay - by
    const dz = az - bz
    return dx * dx + dy * dy + dz * dz
}

function distance3D(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    return Math.sqrt(distanceSquared3D(ax, ay, az, bx, by, bz))
}

function sphereIntersectsAabb(sphereX: number, sphereY: number, sphereZ: number, radius: number, boxX: number, boxY: number, boxZ: number, halfWidth: number, halfHeight: number, halfDepth: number) {
    const closestX = clamp(sphereX, boxX - halfWidth, boxX + halfWidth)
    const closestY = clamp(sphereY, boxY - halfHeight, boxY + halfHeight)
    const closestZ = clamp(sphereZ, boxZ - halfDepth, boxZ + halfDepth)
    return distanceSquared3D(sphereX, sphereY, sphereZ, closestX, closestY, closestZ) <= radius * radius
}

function aabbIntersectsAabb(ax: number, ay: number, az: number, ahw: number, ahh: number, ahd: number, bx: number, by: number, bz: number, bhw: number, bhh: number, bhd: number) {
    return Math.abs(ax - bx) <= ahw + bhw &&
        Math.abs(ay - by) <= ahh + bhh &&
        Math.abs(az - bz) <= ahd + bhd
}

function rayHitsSphere(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, sphereX: number, sphereY: number, sphereZ: number, radius: number) {
    const dx = toX - fromX
    const dy = toY - fromY
    const dz = toZ - fromZ
    const lengthSq = dx * dx + dy * dy + dz * dz
    if (lengthSq === 0) {
        return distanceSquared3D(fromX, fromY, fromZ, sphereX, sphereY, sphereZ) <= radius * radius ? 0 : null
    }

    const fx = fromX - sphereX
    const fy = fromY - sphereY
    const fz = fromZ - sphereZ
    const a = lengthSq
    const b = 2 * (fx * dx + fy * dy + fz * dz)
    const c = fx * fx + fy * fy + fz * fz - radius * radius
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

function rayHitsAabb(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, boxX: number, boxY: number, boxZ: number, halfWidth: number, halfHeight: number, halfDepth: number) {
    const dx = toX - fromX
    const dy = toY - fromY
    const dz = toZ - fromZ
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
    tMin = yResult.tMin
    tMax = yResult.tMax

    const zResult = clipRayAxis(fromZ, dz, boxZ - halfDepth, boxZ + halfDepth, tMin, tMax)
    if (!zResult) {
        return null
    }
    return zResult.tMin
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
