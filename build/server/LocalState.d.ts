import { IdPool } from './IdPool';
import { IEntity } from '../common/IEntity';
import { NDictionary } from './NDictionary';
import { IChannel } from './IChannel';
import { NetworkIdType } from '../common/binary/Protocol';
export declare class LocalState {
    nidType: NetworkIdType;
    nidPool: IdPool;
    /**
     * Entity nid -> source ids currently keeping that entity networked.
     * Source ids can be channels or parent entity nids. They are networking
     * references, not ownership of the user's game object.
     */
    sources: Map<number, Set<number>>;
    /**
     * Parent entity nid -> child entity nids. Children cascade visibility from
     * the parent, but userland still owns object lifetime and game semantics.
     */
    children: Map<number, Set<number>>;
    _entities: NDictionary;
    channels: Set<IChannel>;
    tick(tick: number): void;
    addChild(parentNid: number, child: IEntity): void;
    removeChild(parentNid: number, child: IEntity): void;
    registerEntity(entity: IEntity, sourceId: number): number;
    unregisterEntity(entity: IEntity, sourceId: number): void;
    getByNid(nid: number): IEntity;
    releaseDeferredIds(): void;
}
//# sourceMappingURL=LocalState.d.ts.map