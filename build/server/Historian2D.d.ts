export type HistorianValue = boolean | number | string;
export type Historian2DSpatialIndexOptions = 'none' | {
    type: 'grid';
    cellSize: number;
};
export type Historian2DOptions = {
    retentionMs: number;
    spatialIndex?: Historian2DSpatialIndexOptions;
};
type ValueSource<T, TValue> = keyof T | TValue | ((target: T) => TValue);
export type HistorianSpatialTrackOptions<T extends object> = {
    nid: ValueSource<T, number>;
    x: ValueSource<T, number>;
    y: ValueSource<T, number>;
    radius?: ValueSource<T, number>;
    halfWidth?: ValueSource<T, number>;
    halfHeight?: ValueSource<T, number>;
    flags?: ValueSource<T, number>;
};
export type HistorianSpatialSourceOptions<T extends object> = Omit<HistorianSpatialTrackOptions<T>, 'nid'>;
export type HistorianSpatialSample2D = {
    nid: number;
    tick: number;
    timeMs: number;
    x: number;
    y: number;
    radius?: number;
    halfWidth?: number;
    halfHeight?: number;
    flags?: number;
};
export type HistorianSpatialSampleInput2D = Omit<HistorianSpatialSample2D, 'tick' | 'timeMs'>;
export type HistorianRayHit2D = {
    sample: HistorianSpatialSample2D;
    t: number;
    distance: number;
};
/**
 * Historian2D stores compact authoritative facts for gameplay rewind queries.
 * It intentionally does not decide fairness policy: game code chooses which
 * timestamp and facts matter for shots, shields, trades, or other resolution.
 *
 * Historical existence and current game existence are different concepts. A
 * query may return a copied sample for an object that userland has already
 * deleted from current authoritative state. Games that need death trades,
 * delayed cleanup, revive windows, or corpse interactions should model those as
 * game state and delete later; the historian should not keep entities alive.
 */
export declare class Historian2D {
    retentionMs: number;
    private spatialTrackers;
    private pendingSpatialSamples;
    private frames;
    private values;
    private existence;
    private latestTimeMs;
    private latestTick;
    private spatialIndex;
    constructor(options: Historian2DOptions);
    /**
     * Track a normal spatial object whose gameplay identity and position live
     * on the same object.
     *
     * This is the basic/plain-channel shape:
     *
     *     history.trackSpatial(player, { nid: 'nid', x: 'x', y: 'y' })
     *
     * Query results return `sample.nid`, so choose `nid` as the id that later
     * gameplay should act on.
     */
    trackSpatial<T extends object>(target: T, options: HistorianSpatialTrackOptions<T>, timeMs?: number): number;
    /**
     * Track a spatial source under an explicit gameplay identity.
     *
     * This is useful for ECS or other composed models where the thing hit by a
     * query is not the same object that owns position. For example, an NPC may
     * be the damageable component while a Transform component supplies x/y:
     *
     *     history.trackSpatialTarget(npc.nid, transform, { x: 'x', y: 'y' })
     *
     * Query results return the explicit target nid (`npc.nid` above), while
     * recorded spatial values are read from `source`.
     */
    trackSpatialTarget<T extends object>(nid: number, source: T, options: HistorianSpatialSourceOptions<T>, timeMs?: number): number;
    untrackSpatial(nid: number, timeMs?: number): void;
    recordSpatialSample(sample: HistorianSpatialSampleInput2D): void;
    recordSpatialSamples(samples: HistorianSpatialSampleInput2D[]): void;
    record(tick: number, timeMs: number): void;
    setExists(nid: number, exists: boolean, timeMs: number): void;
    existsAt(nid: number, timeMs: number): boolean | undefined;
    setValue(nid: number, key: string, value: HistorianValue, timeMs: number): void;
    getValue(nid: number, key: string, timeMs: number): HistorianValue | undefined;
    setFlag(nid: number, key: string, active: boolean, timeMs: number): void;
    wasFlagActive(nid: number, key: string, timeMs: number): boolean;
    getSpatialNearest(nid: number, timeMs: number): HistorianSpatialSample2D | null;
    getSpatialInterpolated(nid: number, timeMs: number): HistorianSpatialSample2D | null;
    queryCircleNearest(timeMs: number, x: number, y: number, radius: number): HistorianSpatialSample2D[];
    queryAabbNearest(timeMs: number, x: number, y: number, halfWidth: number, halfHeight: number): HistorianSpatialSample2D[];
    queryRayNearest(timeMs: number, fromX: number, fromY: number, toX: number, toY: number): HistorianRayHit2D[];
    queryRayInterpolated(timeMs: number, fromX: number, fromY: number, toX: number, toY: number): HistorianRayHit2D[];
    getStats(): {
        latestTick: number;
        latestTimeMs: number;
        trackedSpatial: number;
        pendingSpatialSamples: number;
        spatialIndex: string;
        frames: number;
        retainedSamples: number;
        retainedValueIntervals: number;
        retainedExistenceIntervals: number;
        retainedIndexCells: number;
    };
    private copySpatialSampleInput;
    private completeSpatialSample;
    private createSample;
    private createFrameIndex;
    private getFrameCandidates;
    private getSampleBounds;
    private countRetainedIndexCells;
    private interpolateSample;
    private readNumber;
    private setIntervalValue;
    private getIntervalValue;
    private isExistingAt;
    private getNearestFrame;
    private getSurroundingFrames;
    private findFrameIndexAtOrAfter;
    private prune;
    private pruneValueStore;
    private pruneIntervalMap;
    private pruneIntervals;
    private circleIntersectsSample;
    private aabbIntersectsSample;
    private rayHitsSample;
    private resolveTime;
}
export {};
//# sourceMappingURL=Historian2D.d.ts.map