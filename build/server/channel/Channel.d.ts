import { IEntity } from '../../common/IEntity';
import { ChannelHeader, ChannelHeaderInput, ChannelType } from '../../common/ChannelHeader';
import { LocalState } from '../LocalState';
import { NDictionary } from '../NDictionary';
import { User } from '../User';
import { IObjectChannel } from './IChannel';
export type ChannelOptions = {
    header?: ChannelHeaderInput;
    name?: string;
    channelType?: ChannelType;
};
export declare class Channel implements IObjectChannel {
    nid: number;
    localState: LocalState;
    entities: NDictionary;
    entityNids: number[];
    membershipVersion: number;
    deltaBaseVersion: number;
    createdRoots: IEntity[];
    deletedNids: number[];
    skipInterpolationNids: number[];
    broadcastMessages: any[];
    interpolatedBroadcastMessages: any[];
    users: Map<number, User>;
    header: ChannelHeader;
    headerVersion: number;
    channelType: ChannelType;
    private visibleNetworkedNidsCache;
    constructor(localState: LocalState, options?: ChannelOptions);
    private beginDelta;
    addEntity(entity: IEntity): IEntity;
    markHeaderDirty(): boolean;
    removeEntity(entity: IEntity): number;
    markDirty(entity: IEntity): boolean;
    skipInterpolation(entity: IEntity): boolean;
    addMessage(message: any): void;
    addInterpolatedMessage(message: any): void;
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