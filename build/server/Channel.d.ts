import { LocalState } from './LocalState';
import { IEntity } from '../common/IEntity';
import { IChannel } from './IChannel';
import { User } from './User';
import { NDictionary } from './NDictionary';
export declare class Channel implements IChannel {
    nid: number;
    ntype: number;
    localState: LocalState;
    channelEntity: IEntity;
    users: Map<number, User>;
    _entities: NDictionary;
    constructor(localState: LocalState, ntype: number);
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: any): void;
    unsubscribe(user: any): void;
    getVisibileEntities(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=Channel.d.ts.map