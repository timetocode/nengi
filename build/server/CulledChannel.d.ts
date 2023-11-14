import { LocalState } from './LocalState';
import { ICulledChannel, VisibilityResolver } from './IChannel';
import { User } from './User';
import { IEntity } from '../common/IEntity';
export declare class CulledChannel<VisibleObjectType, ViewType> implements ICulledChannel<VisibleObjectType, ViewType> {
    private channel;
    private views;
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>;
    constructor(localState: LocalState, visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>);
    get nid(): number;
    get entities(): import("./NDictionary").NDictionary;
    addEntity(entity: IEntity & VisibleObjectType): IEntity;
    removeEntity(entity: IEntity & VisibleObjectType): void;
    addMessage(message: any): void;
    subscribe(user: User, view: ViewType): void;
    unsubscribe(user: User): void;
    getVisibleEntities(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=CulledChannel.d.ts.map