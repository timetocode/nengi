import { IChannel } from '../server/IChannel';
import { LocalState } from '../server/LocalState';
export declare class User {
    id: number;
    subscriptions: Map<number, IChannel>;
    cache: {
        [prop: number]: number;
    };
    cacheArr: number[];
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
}
//# sourceMappingURL=HotPath.performance.d.ts.map