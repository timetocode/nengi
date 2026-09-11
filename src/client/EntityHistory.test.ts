import { EntityHistory } from './EntityHistory'
import { createInterpolationTestContext } from './InterpolationTestHarness'

function entity(nid: number, x: number, label = 'a') {
    return {
        nid,
        ntype: 1,
        x,
        y: 0,
        label
    }
}

describe('EntityHistory', () => {
    it('returns cloned public states while ref lookups expose retained interpolation state', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        history.recordState(1, entity(1, 10))

        const clone = history.getEntityAtTick(1, 1)!
        const ref = history.getEntityAtTickRef(1, 1)!
        clone.x = 999

        expect(ref.x).toBe(10)
        expect(history.getEntityAtTick(1, 1)!.x).toBe(10)
    })

    it('uses the final state recorded for a tick', () => {
        const history = new EntityHistory(createInterpolationTestContext())

        history.recordState(1, entity(1, 10))
        history.recordDelete(1, 1)
        history.recordState(1, entity(1, 20))

        expect(history.getEntityAtTick(1, 1)!.x).toBe(20)
        expect(history.getStats().retainedRecords).toBe(1)
    })

    it('keeps one pre-prune record so interpolation can sample across the retention boundary', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        for (let tick = 1; tick <= 10; tick++) {
            history.recordState(tick, entity(1, tick * 10))
        }

        history.pruneBefore(6)

        expect(history.getEntityAtTick(1, 5)!.x).toBe(50)
        expect(history.getEntityAtTick(1, 4)).toBeNull()
        expect(history.getEntityAtTick(1, 6)!.x).toBe(60)
        expect(history.getStats().retainedRecords).toBe(6)
    })

    it('drops deleted timelines after they are fully outside the retained interpolation range', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        history.recordState(1, entity(1, 10))
        history.recordDelete(2, 1)

        history.pruneBefore(3)

        expect(history.getEntityAtTick(1, 3)).toBeNull()
        expect(history.getStats().timelines).toBe(0)
    })

    it('keeps stationary state without repeatedly allocating its record array', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        for (let tick = 1; tick <= 10; tick++) {
            history.recordState(tick, entity(1, tick))
        }
        history.pruneBefore(11)
        const records = history.timelines.get(1)!.records
        for (let cutoff = 12; cutoff <= 300; cutoff++) {
            history.pruneBefore(cutoff)
        }
        expect(history.timelines.get(1)!.records).toBe(records)
        expect(history.getStats().records).toBe(1)
        expect(history.getAt(1, 300)!.x).toBe(10)

        history.recordState(301, entity(1, 301))
        history.pruneBefore(301)
        expect(history.getAt(1, 300)!.x).toBe(10)
        history.pruneBefore(302)
        expect(history.getAt(1, 300)).toBeNull()
        expect(history.getStats().records).toBe(1)
    })

    it('indexes separate timelines independently of their recording order', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        history.recordState(100, entity(1, 100))
        history.recordState(1, entity(2, 1))
        history.recordDelete(2, 2)
        history.pruneBefore(3)
        expect(history.timelines.has(2)).toBe(false)
        expect(history.getAt(1, 100)!.x).toBe(100)
    })

    it('reindexes same-tick replacements after that tick has already expired', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        history.recordState(1, entity(1, 1))
        history.pruneBefore(2)
        history.recordState(1, entity(2, 2))
        history.recordDelete(1, 1)
        history.pruneBefore(2)
        expect(history.timelines.has(1)).toBe(false)
        expect(history.getAt(2, 2)!.x).toBe(2)
    })

    it('matches an unpruned event oracle through seeded churn and retention changes', () => {
        const history = new EntityHistory(createInterpolationTestContext())
        const events = new Map<number, Array<{ tick: number, value: ReturnType<typeof entity> | null }>>()
        let seed = 9173
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            return seed / 4294967296
        }
        let cutoff = 1
        for (let tick = 1; tick <= 300; tick++) {
            for (let op = 0; op < 12; op++) {
                const nid = Math.floor(random() * 20)
                const value = random() < 0.3 ? null : entity(nid, tick + op)
                const timeline = events.get(nid) || []
                if (timeline[timeline.length - 1]?.tick === tick) {
                    timeline.pop()
                }
                timeline.push({ tick, value })
                events.set(nid, timeline)
                if (value) {
                    history.recordState(tick, value)
                } else {
                    history.recordDelete(tick, nid)
                }
            }
            cutoff = Math.max(cutoff, tick - (tick < 150 ? 80 : 4))
            history.pruneBefore(cutoff)
            for (const [nid, timeline] of events) {
                for (const sampleTick of [cutoff, Math.floor((cutoff + tick) / 2), tick]) {
                    const previous = timeline.filter(record => record.tick <= sampleTick).pop()
                    expect(history.getAt(nid, sampleTick)).toEqual(previous?.value ?? null)
                }
                const retained = timeline.filter((record, i) => record.tick >= cutoff ||
                    (timeline[i + 1]?.tick ?? Infinity) >= cutoff)
                const last = retained[retained.length - 1]
                const expectedCount = !last.value && last.tick < cutoff ? 0 : retained.length
                const actual = history.timelines.get(nid)
                // An already-expired deleted lifetime may have been removed
                // before this nid was reused; its old tombstone is not needed.
                expect(actual ? actual.records.length - actual.start : 0).toBeLessThanOrEqual(expectedCount)
            }
        }
        for (const nid of events.keys()) {
            history.recordDelete(301, nid)
        }
        history.pruneBefore(302)
        expect(history.getStats()).toEqual({ timelines: 0, records: 0, retainedRecords: 0 })
    })
})
