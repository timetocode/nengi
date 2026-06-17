import type { HistorianValue } from './Historian2D';
export type Historian3DSpatialIndexOptions = 'none' | {
    type: 'grid';
    cellSize: number;
};
export type Historian3DOptions = {
    retentionMs: number;
    spatialIndex?: Historian3DSpatialIndexOptions;
};
type ValueSource<T, TValue> = keyof T | TValue | ((target: T) => TValue);
export type HistorianSpatialTrackOptions3D<T extends object> = {
    nid: ValueSource<T, number>;
    x: ValueSource<T, number>;
    y: ValueSource<T, number>;
    z: ValueSource<T, number>;
    radius?: ValueSource<T, number>;
    halfWidth?: ValueSource<T, number>;
    halfHeight?: ValueSource<T, number>;
    halfDepth?: ValueSource<T, number>;
    flags?: ValueSource<T, number>;
};
export type HistorianSpatialSourceOptions3D<T extends object> = Omit<HistorianSpatialTrackOptions3D<T>, 'nid'>;
export type HistorianSpatialSample3D = {
    nid: number;
    tick: number;
    timeMs: number;
    x: number;
    y: number;
    z: number;
    radius?: number;
    halfWidth?: number;
    halfHeight?: number;
    halfDepth?: number;
    flags?: number;
};
export type HistorianSpatialSampleInput3D = Omit<HistorianSpatialSample3D, 'tick' | 'timeMs'>;
export type HistorianRayHit3D = {
    sample: HistorianSpatialSample3D;
    t: number;
    distance: number;
};
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
export declare class Historian3D {
    retentionMs: number;
    private spatialTrackers;
    private pendingSpatialSamples;
    private frames;
    private values;
    private existence;
    private latestTimeMs;
    private latestTick;
    private spatialIndex;
    constructor(options: Historian3DOptions);
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
    trackSpatial<T extends object>(target: T, options: HistorianSpatialTrackOptions3D<T>, timeMs?: number): number;
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
    trackSpatialTarget<T extends object>(nid: number, source: T, options: HistorianSpatialSourceOptions3D<T>, timeMs?: number): number;
    untrackSpatial(nid: number, timeMs?: number): void;
    recordSpatialSample(sample: HistorianSpatialSampleInput3D): void;
    recordSpatialSamples(samples: HistorianSpatialSampleInput3D[]): void;
    record(tick: number, timeMs: number): void;
    setExists(nid: number, exists: boolean, timeMs: number): void;
    existsAt(nid: number, timeMs: number): boolean | undefined;
    setValue(nid: number, key: string, value: HistorianValue, timeMs: number): void;
    getValue(nid: number, key: string, timeMs: number): HistorianValue | undefined;
    setFlag(nid: number, key: string, active: boolean, timeMs: number): void;
    wasFlagActive(nid: number, key: string, timeMs: number): boolean;
    getSpatialNearest(nid: number, timeMs: number): HistorianSpatialSample3D | null;
    getSpatialInterpolated(nid: number, timeMs: number): HistorianSpatialSample3D | null;
    querySphereNearest(timeMs: number, x: number, y: number, z: number, radius: number): HistorianSpatialSample3D[];
    queryAabbNearest(timeMs: number, x: number, y: number, z: number, halfWidth: number, halfHeight: number, halfDepth: number): HistorianSpatialSample3D[];
    queryRayNearest(timeMs: number, fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): HistorianRayHit3D[];
    queryRayInterpolated(timeMs: number, fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): HistorianRayHit3D[];
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
    private sphereIntersectsSample;
    private aabbIntersectsSample;
    private rayHitsSample;
    private resolveTime;
}
export {};
//# sourceMappingURL=Historian3D.d.ts.map