import { IEntity } from '../../common/IEntity';
import { Historian } from '../Historian';
import { LocalState } from '../LocalState';
import { NDictionary } from '../NDictionary';
import { User } from '../User';
import { IObjectChannel } from './IChannel';
export type ChannelOptions = {
    historian?: Historian;
    header?: IEntity;
    /**
     * Developer-defined label for debugging, logs, tests, or game tooling.
     * Nengi does not interpret this value or send it over the network.
     */
    label?: string;
};
export declare class Channel implements IObjectChannel {
    nid: number;
    label?: string;
    localState: LocalState;
    entities: NDictionary;
    entityNids: number[];
    membershipVersion: number;
    deltaBaseVersion: number;
    createdRoots: IEntity[];
    deletedNids: number[];
    broadcastMessages: any[];
    users: Map<number, User>;
    historian: Historian | null;
    header: IEntity | null;
    headerVersion: number;
    private visibleNetworkedNidsCache;
    constructor(localState: LocalState, options?: ChannelOptions);
    tick(tick: number): void;
    private beginDelta;
    addEntity(entity: IEntity): IEntity;
    setHeader(header: IEntity): IEntity;
    getHeader(): IEntity | null;
    markHeaderDirty(): boolean;
    removeEntity(entity: IEntity): number;
    markDirty(entity: IEntity): boolean;
    addMessage(message: any): void;
    clearBroadcastMessages(): void;
    clearSnapshotDeltas(): void;
    subscribe(user: User): void;
    unsubscribe(user: User): void;
    unsubscribeAll(): void;
    removeAllEntities(): void;
    getVisibleEntities(userId: number): number[];
    getVisibleNetworkedNids(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=Channel.d.ts.map