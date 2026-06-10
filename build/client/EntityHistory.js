"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityHistory = void 0;
const COMPACT_START_THRESHOLD = 64;
/**
 * Client-side entity history is retained for interpolation only.
 *
 * The latest authoritative/raw state lives in EntityStore.entities. This class
 * keeps the past resolved states needed to sample "what did this entity look
 * like at render tick N?" without walking frame diffs during rendering.
 */
class EntityHistory {
    constructor(context) {
        this.timelines = new Map();
        this.context = context;
    }
    recordState(tick, entity) {
        this.append(entity.nid, {
            tick,
            entity: this.cloneEntity(entity),
            deleted: false
        });
    }
    recordDelete(tick, nid) {
        this.append(nid, {
            tick,
            entity: null,
            deleted: true
        });
    }
    getAt(nid, tick) {
        const entity = this.getEntityAtTickRef(nid, tick);
        return entity ? this.cloneEntity(entity) : null;
    }
    getAtRef(nid, tick) {
        return this.getEntityAtTickRef(nid, tick);
    }
    getEntityAtTick(nid, tick) {
        return this.getAt(nid, tick);
    }
    getEntityAtTickRef(nid, tick) {
        const record = this.getRecordAtTick(nid, tick);
        return record && !record.deleted ? record.entity : null;
    }
    getVisibleAt(tick) {
        const entities = new Map();
        this.timelines.forEach((timeline, nid) => {
            const record = this.findRecordAtTick(timeline, tick);
            if (!record.deleted) {
                entities.set(nid, this.cloneEntity(record.entity));
            }
        });
        return entities;
    }
    getVisibleRefsAt(tick) {
        return this.getVisibleEntitiesAtTickRefs(tick);
    }
    getVisibleEntitiesAtTick(tick) {
        return this.getVisibleAt(tick);
    }
    getVisibleEntitiesAtTickRefs(tick) {
        const entities = new Map();
        this.timelines.forEach((timeline, nid) => {
            const record = this.findRecordAtTick(timeline, tick);
            if (!record.deleted) {
                entities.set(nid, record.entity);
            }
        });
        return entities;
    }
    pruneBefore(tick) {
        this.timelines.forEach((timeline, nid) => {
            const firstKeptIndex = this.findFirstIndexAtOrAfter(timeline, tick);
            if (firstKeptIndex === -1) {
                const last = this.getLastRecord(timeline);
                if (!last || last.deleted) {
                    this.timelines.delete(nid);
                    return;
                }
                timeline.records = [last];
                timeline.start = 0;
                return;
            }
            if (firstKeptIndex > timeline.start + 1) {
                timeline.start = firstKeptIndex - 1;
                this.compactTimelineIfNeeded(timeline);
            }
        });
    }
    getStats() {
        let records = 0;
        let retainedRecords = 0;
        this.timelines.forEach(timeline => {
            records += timeline.records.length;
            retainedRecords += timeline.records.length - timeline.start;
        });
        return {
            timelines: this.timelines.size,
            records,
            retainedRecords
        };
    }
    getRecordAtTick(nid, tick) {
        const timeline = this.timelines.get(nid);
        if (!timeline) {
            return null;
        }
        return this.findRecordAtTick(timeline, tick);
    }
    append(nid, record) {
        const timeline = this.timelines.get(nid);
        if (timeline) {
            const last = this.getLastRecord(timeline);
            if (last && last.tick === record.tick) {
                timeline.records[timeline.records.length - 1] = record;
            }
            else {
                timeline.records.push(record);
            }
        }
        else {
            this.timelines.set(nid, {
                records: [record],
                start: 0
            });
        }
    }
    findRecordAtTick(timeline, tick) {
        const index = this.findRecordIndex(timeline, tick);
        return index === -1
            ? { tick: Number.NEGATIVE_INFINITY, entity: null, deleted: true }
            : timeline.records[index];
    }
    findRecordIndex(timeline, tick) {
        let low = timeline.start;
        let high = timeline.records.length - 1;
        let best = -1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeline.records[mid].tick <= tick) {
                best = mid;
                low = mid + 1;
            }
            else {
                high = mid - 1;
            }
        }
        return best;
    }
    findFirstIndexAtOrAfter(timeline, tick) {
        let low = timeline.start;
        let high = timeline.records.length - 1;
        let best = -1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (timeline.records[mid].tick >= tick) {
                best = mid;
                high = mid - 1;
            }
            else {
                low = mid + 1;
            }
        }
        return best;
    }
    getLastRecord(timeline) {
        return timeline.records[timeline.records.length - 1] || null;
    }
    compactTimelineIfNeeded(timeline) {
        if (timeline.start < COMPACT_START_THRESHOLD || timeline.start * 2 < timeline.records.length) {
            return;
        }
        timeline.records = timeline.records.slice(timeline.start);
        timeline.start = 0;
    }
    cloneEntity(entity) {
        const clone = {
            nid: entity.nid,
            ntype: entity.ntype
        };
        const schema = this.context.getSchema(entity.ntype);
        schema.keys.forEach(propSpec => {
            clone[propSpec.prop] = propSpec.binary.clone(entity[propSpec.prop]);
        });
        return clone;
    }
}
exports.EntityHistory = EntityHistory;
