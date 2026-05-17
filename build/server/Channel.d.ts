import { LocalState } from './LocalState';
import { IEntity } from '../common/IEntity';
import { IChannel } from './IChannel';
import { User } from './User';
import { NDictionary } from './NDictionary';
import { Historian } from './Historian';
export type ChannelOptions = {
    historian?: Historian;
    /**
     * Developer-defined label for debugging, logs, tests, or game tooling.
     * Nengi does not interpret this value or send it over the network.
     */
    label?: string;
};
export declare class Channel implements IChannel {
    nid: number;
    label?: string;
    localState: LocalState;
    entities: NDictionary;
    users: Map<number, User>;
    historian: Historian | null;
    constructor(localState: LocalState, options?: ChannelOptions);
    tick(tick: number): void;
    addEntity(entity: IEntity): IEntity;
    removeEntity(entity: IEntity): void;
    addMessage(message: any): void;
    subscribe(user: any): void;
    unsubscribe(user: any): void;
    unsubscribeAll(): void;
    removeAllEntities(): void;
    getVisibleEntities(userId: number): number[];
    destroy(): void;
}
//# sourceMappingURL=Channel.d.ts.map