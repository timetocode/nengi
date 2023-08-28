import { EDictionary } from './EDictionary';
import { LocalState } from './LocalState';
import { IEntity } from '../common/IEntity';
import { IChannel, ChannelSubscriptionHandler } from './IChannel';
import { User } from './User';
export declare class Channel implements IChannel {
    id: number;
    localState: LocalState;
    entities: EDictionary;
    users: Map<number, User>;
    onSubscribe: ChannelSubscriptionHandler;
    onUnsubscribe: ChannelSubscriptionHandler;
    constructor(localState: LocalState);
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: any): void;
    unsubscribe(user: any): void;
    getVisibileEntities(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=Channel.d.ts.map