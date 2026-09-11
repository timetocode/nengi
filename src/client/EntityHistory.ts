import { IEntity } from '../common/IEntity'
import { Context } from '../common/Context'
import { EntityHistoryRecord, EntityTimeline, findRecordIndex } from './entityTimeline'

export type EntityHistoryStats = {
    timelines: number
    records: number
    retainedRecords: number
}

const COMPACT_START_THRESHOLD = 64

type ExpirationBucket = { nids: number[], count: number }

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
    private expirationNids = new Map<number, ExpirationBucket>()
    private spareExpirationBucket: ExpirationBucket | undefined
    private nextExpirationTick = Number.POSITIVE_INFINITY
    private prunedBeforeTick = Number.NEGATIVE_INFINITY

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
        if (tick <= this.nextExpirationTick) {
            return
        }
        this.nextExpirationTick = Number.POSITIVE_INFINITY
        this.prunedBeforeTick = Math.max(this.prunedBeforeTick, tick)
        // The normal client appends in frame order. Inspect the small tick
        // index rather than relying on Map insertion order: standalone users
        // may record separate entities' timelines in a different order.
        this.expirationNids.forEach((bucket, recordedTick) => {
            if (recordedTick < tick) {
                for (let i = 0; i < bucket.count; i++) {
                    this.pruneTimeline(bucket.nids[i], tick)
                }
                this.expirationNids.delete(recordedTick)
                // Reuse one expired buffer on the next recorded tick. Keeping
                // a separate count avoids allocating/growing a dense ID array
                // every frame. Trim any unused suffix from a smaller workload.
                bucket.nids.length = bucket.count
                bucket.count = 0
                this.spareExpirationBucket = bucket
            } else {
                this.nextExpirationTick = Math.min(this.nextExpirationTick, recordedTick)
            }
        })
        if (this.expirationNids.size === 0) {
            this.spareExpirationBucket = undefined
        }
    }

    private pruneTimeline(nid: number, tick: number) {
        const timeline = this.timelines.get(nid)
        if (!timeline) {
            return
        }
        const last = this.getLastRecord(timeline)
        if (!last || (last.deleted && last.tick < tick)) {
            this.timelines.delete(nid)
            return
        }
        if (last.tick < tick) {
            // Release the entire expired prefix when a live timeline becomes
            // stationary. Already compact one-record arrays remain untouched.
            if (timeline.records.length > 1) {
                timeline.records = [last]
                timeline.start = 0
            }
            return
        }
        // Keep the last record strictly before the cutoff, including a live
        // entity's final state when it has stopped changing altogether.
        while (timeline.start + 1 < timeline.records.length && timeline.records[timeline.start + 1].tick < tick) {
            timeline.start++
        }
        this.compactTimelineIfNeeded(timeline)
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
        let replaced = false
        if (timeline) {
            const last = this.getLastRecord(timeline)
            if (last && last.tick === record.tick) {
                timeline.records[timeline.records.length - 1] = record
                replaced = true
            } else {
                timeline.records.push(record)
            }
        } else {
            this.timelines.set(nid, {
                records: [record],
                start: 0
            })
        }
        // One ID per entity per recorded tick, including tombstones. A record
        // replaced after its tick was already pruned must be indexed again.
        if (!replaced || record.tick < this.prunedBeforeTick) {
            let bucket = this.expirationNids.get(record.tick)
            if (!bucket) {
                bucket = this.spareExpirationBucket ?? { nids: [], count: 0 }
                this.spareExpirationBucket = undefined
                this.expirationNids.set(record.tick, bucket)
                this.nextExpirationTick = Math.min(this.nextExpirationTick, record.tick)
            }
            bucket.nids[bucket.count++] = nid
        }
    }

    private findRecordAtTick(timeline: EntityTimeline, tick: number): EntityHistoryRecord {
        const index = findRecordIndex(timeline, tick)
        return index === -1
            ? { tick: Number.NEGATIVE_INFINITY, entity: null, deleted: true }
            : timeline.records[index]
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
