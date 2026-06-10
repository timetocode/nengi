import { IEntity } from '../common/IEntity';
import { Context } from '../common/Context';
type EntityHistoryRecord = {
    tick: number;
    entity: IEntity;
    deleted: false;
} | {
    tick: number;
    entity: null;
    deleted: true;
};
type EntityTimeline = {
    records: EntityHistoryRecord[];
    start: number;
};
export type EntityHistoryStats = {
    timelines: number;
    records: number;
    retainedRecords: number;
};
/**
 * Client-side entity history is retained for interpolation only.
 *
 * The latest authoritative/raw state lives in EntityStore.entities. This class
 * keeps the past resolved states needed to sample "what did this entity look
 * like at render tick N?" without walking frame diffs during rendering.
 */
export declare class EntityHistory {
    context: Context;
    timelines: Map<number, EntityTimeline>;
    constructor(context: Context);
    recordState(tick: number, entity: IEntity): void;
    recordDelete(tick: number, nid: number): void;
    getAt(nid: number, tick: number): IEntity | null;
    getAtRef(nid: number, tick: number): IEntity | null;
    getEntityAtTick(nid: number, tick: number): IEntity | null;
    getEntityAtTickRef(nid: number, tick: number): IEntity | null;
    getVisibleAt(tick: number): Map<number, IEntity>;
    getVisibleRefsAt(tick: number): Map<number, IEntity>;
    getVisibleEntitiesAtTick(tick: number): Map<number, IEntity>;
    getVisibleEntitiesAtTickRefs(tick: number): Map<number, IEntity>;
    pruneBefore(tick: number): void;
    getStats(): EntityHistoryStats;
    private getRecordAtTick;
    private append;
    private findRecordAtTick;
    private findRecordIndex;
    private findFirstIndexAtOrAfter;
    private getLastRecord;
    private compactTimelineIfNeeded;
    private cloneEntity;
}
export {};
//# sourceMappingURL=EntityHistory.d.ts.map