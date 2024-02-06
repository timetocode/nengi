import { LocalState } from './LocalState';
import { IEntity } from '../common/IEntity';
import { IChannel } from './IChannel';
import { User } from './User';
import { NDictionary } from './NDictionary';
import { Historian } from './Historian';
export declare class Channel implements IChannel {
    nid: number;
    localState: LocalState;
    entities: NDictionary;
    users: Map<number, User>;
    historian: Historian | null;
    constructor(localState: LocalState, historian?: Historian);
    tick(tick: number): void;
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: any): void;
    unsubscribe(user: any): void;
    getVisibleEntities(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=Channel.d.ts.map