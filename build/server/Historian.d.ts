import { Context } from '../common/Context';
import { IEntity } from '../common/IEntity';
import { NDictionary } from './NDictionary';
export type HistorySnapshot = Map<number, IEntity>;
export declare class Historian {
    context: Context;
    tickRatePerSecond: number;
    history: {
        [tick: number]: HistorySnapshot;
    };
    tick: number;
    ticksToStore: number;
    constructor(context: Context, tickRatePerSecond: number, ticksToStore?: number);
    record(tick: number, entities: NDictionary): void;
    /**
     * Gets past state of entities from the frame nearest the time requested, lower performance cost
     * @param millisecondsAgo
     * @returns Map<nid, IEntity>
     */
    getFastLagCompensatedState(millisecondsAgo: number): HistorySnapshot;
    /**
     * Gets past state of entities computed as a position between frames, moderate performance cost
     * @param millisecondsAgo
     * @returns Map<nid, IEntity>
     */
    getComputedLagCompensatedState(millisecondsAgo: number): HistorySnapshot;
}
//# sourceMappingURL=Historian.d.ts.map