import { EDictionary } from './EDictionary';
import { LocalState } from './LocalState';
import { IEntity } from '../common/IEntity';
import { ICulledChannel, CulledChannelSubscriptionHandler, VisibilityResolver } from './IChannel';
import { User } from './User';
export declare class CulledChannel<VisibleObjectType, ViewType> implements ICulledChannel<VisibleObjectType, ViewType> {
    id: number;
    localState: LocalState;
    entities: EDictionary;
    users: Map<number, User>;
    views: Map<number, ViewType>;
    onSubscribe: CulledChannelSubscriptionHandler;
    onUnsubscribe: CulledChannelSubscriptionHandler;
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>;
    constructor(localState: LocalState);
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: any, view: ViewType): void;
    unsubscribe(user: any): void;
    getVisibileEntities(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=CulledChannel.d.ts.map