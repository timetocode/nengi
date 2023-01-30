import EDictionary from './EDictionary';
import LocalState from './LocalState';
import IEntity from '../common/IEntity';
import IChannel from './IChannel';
declare class Channel implements IChannel {
    id: number;
    localState: LocalState;
    entities: EDictionary;
    users: Map<any, any>;
    destroyed: boolean;
    constructor(localState: LocalState, id: number);
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: any): void;
    unsubscribe(user: any): void;
    getVisible(userId: number): number[];
    destroy(): void;
}
export { Channel };
