import { IChannel } from '../server/IChannel';
import { LocalState } from '../server/LocalState';
type nid = number;
type tick = number;
export declare class User {
    id: number;
    subscriptions: Map<number, IChannel>;
    tickLastSeen: {
        [prop: nid]: tick;
    };
    currentlyVisible: nid[];
    localState: LocalState;
    constructor(localState: LocalState);
    subscribe(channel: IChannel): void;
    unsubscribe(channel: IChannel): void;
    createOrUpdate(nid: number, tick: number, toCreate: number[], toUpdate: number[]): void;
    checkVisibility(tick: number): {
        toDelete: number[];
        toUpdate: number[];
        toCreate: number[];
    };
    createOrUpdate2(nid: number, tick: number, toCreate: number[], toUpdate: number[]): void;
    populateDeletions(tick: number, toDelete: number[]): void;
    checkVisibility2(tick: number): {
        toDelete: number[];
        toUpdate: number[];
        toCreate: number[];
    };
}
export {};
//# sourceMappingURL=HotPath.performance.d.ts.map