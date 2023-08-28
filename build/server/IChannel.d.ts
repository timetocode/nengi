import { IEntity } from '../common/IEntity';
import { User } from './User';
export type ChannelSubscriptionHandler = (user: User, channel: IChannel) => void;
export type CulledChannelSubscriptionHandler = (user: User, channel: ICulledChannel<any, any>) => void;
export type VisibilityResolver<VisibleObjectType, ViewType> = (obj: VisibleObjectType, view: ViewType) => boolean;
export interface IChannel {
    id: number;
    addEntity(entity: IEntity): void;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: User, view?: any): void;
    unsubscribe(user: User): void;
    getVisibileEntities(userId: number): number[];
}
export interface ICulledChannel<VisibleObjectType, ViewType> {
    id: number;
    addEntity(entity: IEntity): void;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: User, view: ViewType): void;
    unsubscribe(user: User): void;
    onSubscribe: CulledChannelSubscriptionHandler;
    onUnsubscribe: CulledChannelSubscriptionHandler;
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>;
    getVisibileEntities(userId: number): number[];
}
//# sourceMappingURL=IChannel.d.ts.map