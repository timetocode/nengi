import { Historian2D } from './Historian2D'
import { Historian3D } from './Historian3D'

type Shape = { nid: number, center: number[], radius?: number, half?: number[] }
type Geometry = { from: number[], to: number[], radius: number, half: number[] }

function historyFor(dimensions: number, indexed = true, cellSize = 64) {
    const options = { retentionMs: 1000, spatialIndex: indexed ? { type: 'grid' as const, cellSize } : 'none' as const }
    return dimensions === 2 ? new Historian2D(options) : new Historian3D(options)
}

function record(history: Historian2D | Historian3D, shapes: Shape[], tick = 1, time = 0) {
    for (const shape of shapes) {
        const [x, y, z] = shape.center
        history.recordSpatialSample({
            nid: shape.nid, x, y, z,
            radius: shape.radius,
            halfWidth: shape.half?.[0], halfHeight: shape.half?.[1], halfDepth: shape.half?.[2]
        })
    }
    history.record(tick, time)
}

function query(history: Historian2D | Historian3D, kind: number, geometry: Geometry, time = 0) {
    const { from, to, radius, half } = geometry
    if (history instanceof Historian2D) {
        if (kind === 0) return history.queryCircleNearest(time, from[0], from[1], radius)
        if (kind === 1) return history.queryAabbNearest(time, from[0], from[1], half[0], half[1])
        return history.queryRayNearest(time, from[0], from[1], to[0], to[1]).map(hit => hit.sample)
    }
    if (kind === 0) return history.querySphereNearest(time, from[0], from[1], from[2], radius)
    if (kind === 1) return history.queryAabbNearest(time, from[0], from[1], from[2], half[0], half[1], half[2])
    return history.queryRayNearest(time, from[0], from[1], from[2], to[0], to[1], to[2]).map(hit => hit.sample)
}

const ids = (samples: { nid: number }[]) => samples.map(sample => sample.nid).sort((a, b) => a - b)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

// Independent hit-set oracle: closest-point distance for balls, interval overlap
// for boxes, and segment clipping for rays. It does not use historian helpers.
function intersects(shape: Shape, kind: number, g: Geometry) {
    const delta = g.to.map((value, axis) => value - g.from[axis])
    if (kind === 2) {
        if (shape.half) {
            let enter = 0
            let leave = 1
            for (let axis = 0; axis < g.from.length; axis++) {
                const min = shape.center[axis] - shape.half[axis]
                const max = shape.center[axis] + shape.half[axis]
                if (delta[axis] === 0) {
                    if (g.from[axis] < min || g.from[axis] > max) return false
                } else {
                    const a = (min - g.from[axis]) / delta[axis]
                    const b = (max - g.from[axis]) / delta[axis]
                    enter = Math.max(enter, Math.min(a, b))
                    leave = Math.min(leave, Math.max(a, b))
                }
            }
            return enter <= leave
        }
        const lengthSquared = delta.reduce((total, value) => total + value * value, 0)
        const projection = shape.center.reduce((total, value, axis) => total + (value - g.from[axis]) * delta[axis], 0)
        const t = lengthSquared === 0 ? 0 : clamp(projection / lengthSquared, 0, 1)
        const distanceSquared = shape.center.reduce((total, value, axis) => total + (value - g.from[axis] - t * delta[axis]) ** 2, 0)
        return distanceSquared <= (shape.radius ?? 0) ** 2
    }
    if (kind === 1 && shape.half) {
        return shape.center.every((value, axis) => Math.abs(value - g.from[axis]) <= g.half[axis] + shape.half![axis])
    }
    if (kind === 0 && !shape.half) {
        return Math.hypot(...shape.center.map((value, axis) => value - g.from[axis])) <= g.radius + (shape.radius ?? 0)
    }
    const ball = kind === 0 ? g.from : shape.center
    const center = kind === 0 ? shape.center : g.from
    const half = kind === 0 ? shape.half! : g.half
    const radius = kind === 0 ? g.radius : shape.radius ?? 0
    const distance = ball.map((value, axis) => value - clamp(value, center[axis] - half[axis], center[axis] + half[axis]))
    return Math.hypot(...distance) <= radius
}

// Stop a regressed loop quickly instead of hanging Jest or allocating millions
// of buckets. Assertions themselves run after the original Map is restored.
function withCellBudget(action: () => void) {
    const get = Map.prototype.get
    let lookups = 0
    const spy = jest.spyOn(Map.prototype, 'get').mockImplementation(function (this: Map<unknown, unknown>, key: unknown) {
        if (++lookups > 10000) throw new Error('Historian exceeded probe cell budget')
        return get.call(this, key)
    })
    try {
        action()
    } finally {
        spy.mockRestore()
    }
}

describe.each([2, 3])('bounded %dD historian index', dimensions => {
    test.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid cellSize %s at construction', cellSize => {
        expect(() => historyFor(dimensions, true, cellSize)).toThrow('cellSize')
    })

    test('rejects incomplete grid options and preserves the existing minimum cell size', () => {
        const Historian = dimensions === 2 ? Historian2D : Historian3D
        expect(() => new Historian({ retentionMs: 1000, spatialIndex: 'grid' as any })).toThrow('spatialIndex')
        expect(() => new Historian({ retentionMs: 1000, spatialIndex: { type: 'grid' } as any })).toThrow('cellSize')
        const history = historyFor(dimensions, true, 0.25)
        record(history, [{ nid: 1, center: Array(dimensions).fill(0.5), radius: 0.2 }])
        expect(history.getStats().retainedIndexCells).toBe(1)
    })

    test('large queries fall back without losing hits or revisiting empty cells indefinitely', () => {
        const history = historyFor(dimensions)
        record(history, [
            { nid: 1, center: Array(dimensions).fill(10), radius: 4 },
            { nid: 2, center: Array(dimensions).fill(-30), half: Array(dimensions).fill(5) }
        ])
        expect(history.getStats().retainedIndexCells).toBeGreaterThan(0)
        const geometry = { from: Array(dimensions).fill(-1e5), to: Array(dimensions).fill(1e5), radius: 3e5, half: Array(dimensions).fill(3e5) }
        for (const kind of [0, 1, 2]) {
            let result: { nid: number }[] = []
            withCellBudget(() => { result = query(history, kind, geometry) })
            expect(ids(result)).toEqual([1, 2])
        }
    })

    test.each([0, 1])('an oversized sample disables that frame index, placement %s', at => {
        const history = historyFor(dimensions)
        const shapes: Shape[] = [{ nid: 1, center: Array(dimensions).fill(20), radius: 4 }]
        shapes.splice(at, 0, { nid: 2, center: Array(dimensions).fill(0), half: Array(dimensions).fill(1e9) })
        withCellBudget(() => record(history, shapes))
        expect(history.getStats().retainedIndexCells).toBe(0)
        const geometry = { from: Array(dimensions).fill(20), to: Array(dimensions).fill(30), radius: 1, half: Array(dimensions).fill(1) }
        expect(ids(query(history, 0, geometry))).toEqual([1, 2])
        record(history, [shapes.find(shape => shape.nid === 1)!], 2, 50)
        expect(history.getStats().retainedIndexCells).toBeGreaterThan(0)
        expect(ids(query(history, 0, geometry, 50))).toEqual([1])
        expect(ids(query(history, 0, geometry, 0))).toEqual([1, 2])
    })

    test('unsafe one-cell coordinates do not enter a non-progressing loop', () => {
        const history = historyFor(dimensions)
        record(history, [{ nid: 1, center: Array(dimensions).fill(0), radius: 1 }])
        const position = [2 ** 60, ...Array(dimensions - 1).fill(0)]
        const geometry = { from: position, to: position, radius: 0, half: Array(dimensions).fill(0) }
        withCellBudget(() => query(history, 2, geometry))
        withCellBudget(() => record(history, [{ nid: 2, center: position, radius: 0 }], 2, 50))
        expect(ids(query(history, 2, geometry, 50))).toEqual([2])
    })

    test('recording bounds cumulative entries even when samples overlap the same cells', () => {
        const history = historyFor(dimensions)
        const shapes: Shape[] = Array.from({ length: 64 }, (_, i) => ({
            nid: i + 1, center: Array(dimensions).fill(0), half: Array(dimensions).fill(dimensions === 2 ? 384 : 192)
        }))
        withCellBudget(() => record(history, shapes))
        expect(history.getStats().retainedIndexCells).toBe(0)
        const geometry = { from: Array(dimensions).fill(0), to: Array(dimensions).fill(1), radius: 1, half: Array(dimensions).fill(1) }
        expect(ids(query(history, 0, geometry))).toEqual(shapes.map(shape => shape.nid))
    })

    test('non-finite geometry cannot cause index loops to run unbounded', () => {
        const history = historyFor(dimensions)
        record(history, [{ nid: 1, center: Array(dimensions).fill(0), radius: 1 }])
        for (const value of [Infinity, -Infinity, NaN]) {
            const geometry = { from: Array(dimensions).fill(value), to: Array(dimensions).fill(value), radius: 1, half: Array(dimensions).fill(1) }
            withCellBudget(() => query(history, 2, geometry))
            withCellBudget(() => record(historyFor(dimensions), [{ nid: 2, center: geometry.from, radius: 1 }]))
        }
        // Results for invalid geometry are deliberately not specified.
    })

    test('indexed and scan paths agree with an independent geometry and existence oracle', () => {
        let seed = 371 + dimensions
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            return seed / 2 ** 32
        }
        const point = () => Array.from({ length: dimensions }, () => random() * 2000 - 1000)
        const shapes: Shape[] = Array.from({ length: 120 }, (_, i) => ({
            nid: i + 1, center: point(),
            ...(i % 2 === 0 ? { radius: 4 + random() * 12 } : { half: Array.from({ length: dimensions }, () => 4 + random() * 12) })
        }))
        const indexed = historyFor(dimensions)
        const scan = historyFor(dimensions, false)
        const frames: Shape[][] = []
        for (let tick = 0; tick < 8; tick++) {
            for (const shape of shapes) shape.center = shape.center.map(value => value + random() * 20 - 10)
            frames.push(shapes.map(shape => ({ ...shape, center: shape.center.slice() })))
            record(indexed, shapes, tick, tick * 50)
            record(scan, shapes, tick, tick * 50)
        }
        indexed.setExists(1, true, 0)
        indexed.setExists(1, false, 175)
        scan.setExists(1, true, 0)
        scan.setExists(1, false, 175)
        for (let i = 0; i < 900; i++) {
            const time = random() * 350
            const frame = Math.ceil(time / 50 - 0.5)
            const from = i % 3 === 0 ? frames[frame][i % shapes.length].center : point()
            const geometry = { from, to: point(), radius: random() * 100, half: Array.from({ length: dimensions }, () => random() * 100) }
            const kind = i % 3
            const expected = ids(frames[frame].filter(shape => (shape.nid !== 1 || time < 175) && intersects(shape, kind, geometry)))
            expect(ids(query(scan, kind, geometry, time))).toEqual(expected)
            expect(ids(query(indexed, kind, geometry, time))).toEqual(expected)
        }
    })
})
