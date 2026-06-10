export type HistorianValue = boolean | number | string;
export type Historian2DOptions = {
    retentionMs: number;
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
export type HistorianRayHit2D = {
    sample: HistorianSpatialSample2D;
    t: number;
    distance: number;
};
/**
 * Historian2D stores compact authoritative facts for gameplay rewind queries.
 * It intentionally does not decide fairness policy: game code chooses which
 * timestamp and facts matter for shots, shields, trades, or other resolution.
 */
export declare class Historian2D {
    retentionMs: number;
    private spatialTrackers;
    private frames;
    private values;
    private existence;
    private latestTimeMs;
    private latestTick;
    constructor(options: Historian2DOptions);
    trackSpatial<T extends object>(target: T, options: HistorianSpatialTrackOptions<T>, timeMs?: number): number;
    untrackSpatial(nid: number, timeMs?: number): void;
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
        frames: number;
        retainedSamples: number;
        retainedValueIntervals: number;
        retainedExistenceIntervals: number;
    };
    private createSample;
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
}
export {};
//# sourceMappingURL=Historian2D.d.ts.map