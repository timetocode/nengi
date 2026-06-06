import { IEntity } from '../common/IEntity'
import { Context } from '../common/Context'

type EntityHistoryRecord =
    | { tick: number, entity: IEntity, deleted: false }
    | { tick: number, entity: null, deleted: true }

type EntityTimeline = {
    records: EntityHistoryRecord[]
    start: number
}

export type EntityHistoryStats = {
    timelines: number
    records: number
    retainedRecords: number
}

const COMPACT_START_THRESHOLD = 64

/**
 * Client-side entity history is retained for interpolation only.
 *
 * The latest authoritative/raw state lives in EntityStore.entities. This class
 * keeps the past resolved states needed to sample "what did this entity look
 * like at render tick N?" without walking frame diffs during rendering.
 */
export class EntityHistory {
    context: Context
    timelines = new Map<number, EntityTimeline>()

    constructor(context: Context) {
        this.context = context
    }

    recordState(tick: number, entity: IEntity) {
        this.append(entity.nid, {
            tick,
            entity: this.cloneEntity(entity),
            deleted: false
        })
    }

    recordDelete(tick: number, nid: number) {
        this.append(nid, {
            tick,
            entity: null,
            deleted: true
        })
    }

    getAt(nid: number, tick: number): IEntity | null {
        const entity = this.getEntityAtTickRef(nid, tick)
        return entity ? this.cloneEntity(entity) : null
    }

    getAtRef(nid: number, tick: number): IEntity | null {
        return this.getEntityAtTickRef(nid, tick)
    }

    getEntityAtTick(nid: number, tick: number): IEntity | null {
        return this.getAt(nid, tick)
    }

    getEntityAtTickRef(nid: number, tick: number): IEntity | null {
        const record = this.getRecordAtTick(nid, tick)
        return record && !record.deleted ? record.entity : null
    }

    getVisibleAt(tick: number): Map<number, IEntity> {
        const entities = new Map<number, IEntity>()
        this.timelines.forEach((timeline, nid) => {
            const record = this.findRecordAtTick(timeline, tick)
            if (!record.deleted) {
                entities.set(nid, this.cloneEntity(record.entity))
            }
        })
        return entities
    }

    getVisibleRefsAt(tick: number): Map<number, IEntity> {
        return this.getVisibleEntitiesAtTickRefs(tick)
    }

    getVisibleEntitiesAtTick(tick: number): Map<number, IEntity> {
        return this.getVisibleAt(tick)
    }

    getVisibleEntitiesAtTickRefs(tick: number): Map<number, IEntity> {
        const entities = new Map<number, IEntity>()
        this.timelines.forEach((timeline, nid) => {
            const record = this.findRecordAtTick(timeline, tick)
            if (!record.deleted) {
                entities.set(nid, record.entity)
            }
        })
        return entities
    }

    pruneBefore(tick: number) {
        this.timelines.forEach((timeline, nid) => {
            const firstKeptIndex = this.findFirstIndexAtOrAfter(timeline, tick)
            if (firstKeptIndex === -1) {
                const last = this.getLastRecord(timeline)
                if (!last || last.deleted) {
                    this.timelines.delete(nid)
                    return
                }
                timeline.records = [last]
                timeline.start = 0
                return
            }

            if (firstKeptIndex > timeline.start + 1) {
                timeline.start = firstKeptIndex - 1
                this.compactTimelineIfNeeded(timeline)
            }
        })
    }

    getStats(): EntityHistoryStats {
        let records = 0
        let retainedRecords = 0
        this.timelines.forEach(timeline => {
            records += timeline.records.length
            retainedRecords += timeline.records.length - timeline.start
        })
        return {
            timelines: this.timelines.size,
            records,
            retainedRecords
        }
    }

    private getRecordAtTick(nid: number, tick: number): EntityHistoryRecord | null {
        const timeline = this.timelines.get(nid)
        if (!timeline) {
            return null
        }
        return this.findRecordAtTick(timeline, tick)
    }

    private append(nid: number, record: EntityHistoryRecord) {
        const timeline = this.timelines.get(nid)
        if (timeline) {
            const last = this.getLastRecord(timeline)
            if (last && last.tick === record.tick) {
                timeline.records[timeline.records.length - 1] = record
            } else {
                timeline.records.push(record)
            }
        } else {
            this.timelines.set(nid, {
                records: [record],
                start: 0
            })
        }
    }

    private findRecordAtTick(timeline: EntityTimeline, tick: number): EntityHistoryRecord {
        const index = this.findRecordIndex(timeline, tick)
        return index === -1
            ? { tick: Number.NEGATIVE_INFINITY, entity: null, deleted: true }
            : timeline.records[index]
    }

    private findRecordIndex(timeline: EntityTimeline, tick: number) {
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

    private findFirstIndexAtOrAfter(timeline: EntityTimeline, tick: number) {
        let low = timeline.start
        let high = timeline.records.length - 1
        let best = -1

        while (low <= high) {
            const mid = (low + high) >> 1
            if (timeline.records[mid].tick >= tick) {
                best = mid
                high = mid - 1
            } else {
                low = mid + 1
            }
        }

        return best
    }

    private getLastRecord(timeline: EntityTimeline) {
        return timeline.records[timeline.records.length - 1] || null
    }

    private compactTimelineIfNeeded(timeline: EntityTimeline) {
        if (timeline.start < COMPACT_START_THRESHOLD || timeline.start * 2 < timeline.records.length) {
            return
        }
        timeline.records = timeline.records.slice(timeline.start)
        timeline.start = 0
    }

    private cloneEntity(entity: IEntity): IEntity {
        const clone: IEntity = {
            nid: entity.nid,
            ntype: entity.ntype
        }
        const schema = this.context.getSchema(entity.ntype)
        schema.keys.forEach(propSpec => {
            clone[propSpec.prop] = propSpec.binary.clone(entity[propSpec.prop])
        })
        return clone
    }
}
