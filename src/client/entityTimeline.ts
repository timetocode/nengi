import { IEntity } from '../common/IEntity'

export type EntityHistoryRecord =
    | { tick: number, entity: IEntity, deleted: false }
    | { tick: number, entity: null, deleted: true }

export type EntityTimeline = {
    records: EntityHistoryRecord[]
    start: number
}

export function findRecordIndex(timeline: EntityTimeline, tick: number) {
    let low = timeline.start
    let high = timeline.records.length - 1
    let best = -1
    while (low <= high) {
        const mid = (low + high) >> 1
        if (timeline.records[mid].tick <= tick) {
            best = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return best
}

/** Internal sampling path: bounds are equal or consecutive integer frame ticks. */
export function sampleEntityTimelines(
    timelines: Map<number, EntityTimeline>,
    tickA: number,
    tickB: number,
    sample: (nid: number, entityA: IEntity, entityB: IEntity | null) => IEntity
) {
    const entities = new Map<number, IEntity>()
    timelines.forEach((timeline, nid) => {
        const index = findRecordIndex(timeline, tickA)
        if (index === -1) {
            return
        }
        const recordA = timeline.records[index]
        if (recordA.deleted) {
            return
        }
        // append() retains only the final record for a tick, so there can be
        // at most one new record between adjacent interpolation bounds.
        const next = timeline.records[index + 1]
        const recordB = next && next.tick <= tickB ? next : recordA
        entities.set(nid, sample(nid, recordA.entity, recordB.deleted ? null : recordB.entity))
    })
    return entities
}
