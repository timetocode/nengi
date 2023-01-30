import EDictionary from './EDictionary';
import LocalState from './LocalState';
import IEntity from '../common/IEntity';
import { ViewAABB } from './ViewAABB';
import IChannel from './IChannel';
declare class SpatialChannel implements IChannel {
    id: number;
    localState: LocalState;
    entities: EDictionary;
    users: Map<any, any>;
    views: Map<any, any>;
    destroyed: boolean;
    constructor(localState: LocalState, id: number);
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    getVisible(userId: number): number[];
    subscribe(user: any, view: ViewAABB): void;
    unsubscribe(user: any): void;
    destroy(): void;
}
export { SpatialChannel };
