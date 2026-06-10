import { Historian2D } from './Historian2D'

type Body = {
    nid: number
    x: number
    y: number
    radius: number
    halfWidth?: number
    halfHeight?: number
    flags: number
}

function trackBody(history: Historian2D, body: Body, timeMs?: number) {
    const options = {
        nid: 'nid' as const,
        x: 'x' as const,
        y: 'y' as const,
        radius: 'radius' as const,
        flags: 'flags' as const
    }
    if (body.halfWidth !== undefined && body.halfHeight !== undefined) {
        return history.trackSpatial(body, {
            ...options,
            halfWidth: 'halfWidth',
            halfHeight: 'halfHeight'
        }, timeMs)
    }
    return history.trackSpatial(body, {
        ...options
    }, timeMs)
}

describe('Historian2D', () => {
    it('records compact spatial samples without retaining live object references', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const body = { nid: 1, x: 10, y: 20, radius: 4, flags: 7 }
        trackBody(history, body, 0)

        history.record(1, 50)
        body.x = 999
        body.y = 999
        body.flags = 2

        const sample = history.getSpatialNearest(1, 50)!
        expect(sample).toMatchObject({ nid: 1, tick: 1, timeMs: 50, x: 10, y: 20, radius: 4, flags: 7 })
    })

    it('returns nearest and interpolated spatial samples', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 1 }
        trackBody(history, body, 0)

        history.record(1, 100)
        body.x = 100
        body.y = 50
        body.radius = 20
        body.flags = 2
        history.record(2, 200)

        expect(history.getSpatialNearest(1, 151)).toMatchObject({ x: 100, y: 50, radius: 20 })
        expect(history.getSpatialInterpolated(1, 150)).toMatchObject({ x: 50, y: 25, radius: 15, flags: 2 })
    })

    it('keeps temporal values as intervals independent of sampled frames', () => {
        const history = new Historian2D({ retentionMs: 1000 })

        history.setFlag(1, 'invulnerable', false, 100)
        history.setFlag(1, 'invulnerable', true, 140)
        history.setFlag(1, 'invulnerable', false, 220)
        history.setValue(1, 'stance', 'ice-block', 140)
        history.setValue(1, 'stance', 'normal', 220)

        expect(history.wasFlagActive(1, 'invulnerable', 120)).toBe(false)
        expect(history.wasFlagActive(1, 'invulnerable', 180)).toBe(true)
        expect(history.wasFlagActive(1, 'invulnerable', 250)).toBe(false)
        expect(history.getValue(1, 'stance', 180)).toBe('ice-block')
        expect(history.getValue(1, 'stance', 250)).toBe('normal')
    })

    it('uses existence intervals to filter historical spatial queries', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 0 }
        trackBody(history, body, 0)
        history.record(1, 100)

        history.setExists(1, false, 120)

        expect(history.getSpatialNearest(1, 100)).not.toBeNull()
        expect(history.getSpatialNearest(1, 130)).toBeNull()
        expect(history.queryCircleNearest(130, 0, 0, 100)).toHaveLength(0)
    })

    it('queries circles, aabbs, and rays against historical samples', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const circle = { nid: 1, x: 40, y: 0, radius: 10, flags: 0 }
        const box = { nid: 2, x: 90, y: 0, radius: 0, halfWidth: 10, halfHeight: 10, flags: 0 }
        const miss = { nid: 3, x: 40, y: 60, radius: 10, flags: 0 }
        trackBody(history, circle, 0)
        trackBody(history, box, 0)
        trackBody(history, miss, 0)
        history.record(1, 100)

        expect(history.queryCircleNearest(100, 0, 0, 35).map(sample => sample.nid)).toEqual([1])
        expect(history.queryAabbNearest(100, 90, 20, 12, 12).map(sample => sample.nid)).toEqual([2])

        const hits = history.queryRayNearest(100, 0, 0, 120, 0)
        expect(hits.map(hit => hit.sample.nid)).toEqual([1, 2])
        expect(hits[0].distance).toBeCloseTo(30)
        expect(hits[1].distance).toBeCloseTo(80)
    })

    it('can ray query interpolated positions between retained frames', () => {
        const history = new Historian2D({ retentionMs: 1000 })
        const target = { nid: 1, x: 40, y: 30, radius: 8, flags: 0 }
        trackBody(history, target, 0)
        history.record(1, 100)
        target.y = -30
        history.record(2, 200)

        expect(history.queryRayNearest(150, 0, 0, 80, 0)).toHaveLength(0)
        const hits = history.queryRayInterpolated(150, 0, 0, 80, 0)
        expect(hits).toHaveLength(1)
        expect(hits[0].sample.nid).toBe(1)
        expect(hits[0].sample.y).toBeCloseTo(0)
    })

    it('prunes old spatial frames and closed intervals by retention window', () => {
        const history = new Historian2D({ retentionMs: 100 })
        const body = { nid: 1, x: 0, y: 0, radius: 10, flags: 0 }
        trackBody(history, body, 0)

        history.setFlag(1, 'shield', true, 10)
        history.setFlag(1, 'shield', false, 20)
        history.record(1, 0)
        history.record(2, 50)
        history.record(3, 150)

        expect(history.getSpatialNearest(1, 0)?.timeMs).toBe(50)
        expect(history.wasFlagActive(1, 'shield', 15)).toBe(false)
        expect(history.getStats()).toMatchObject({
            frames: 2,
            retainedSamples: 2,
            retainedValueIntervals: 1
        })
    })
})
