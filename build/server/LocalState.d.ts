import { IdPool } from './IdPool';
import { IEntity } from '../common/IEntity';
import { NDictionary } from './NDictionary';
import { IChannel } from './channel/IChannel';
import { NetworkIdType } from '../common/binary/Protocol';
export declare class LocalState {
    nidType: NetworkIdType;
    nidPool: IdPool;
    dirtyNids: Set<number>;
    entityTreeVersion: number;
    /**
     * Entity nid -> owner nid currently keeping that entity networked.
     * Root entities are owned by a channel. Child entities are owned by their
     * parent entity and cascade visibility through the root.
     */
    ownerByNid: Map<number, number>;
    /**
     * Parent entity nid -> child entity nids. Children cascade visibility from
     * the parent, but userland still owns object lifetime and game semantics.
     */
    children: Map<number, Set<number>>;
    parentByNid: Map<number, number>;
    rootByNid: Map<number, number>;
    _entities: NDictionary;
    channels: Set<IChannel>;
    private treeCache;
    private treeDeleteCache;
    nextNetworkId(): number;
    private assertRegisteredParent;
    private invalidateEntityTreeCache;
    private invalidateEntityTreeSubtree;
    addChild(parent: IEntity, child: IEntity): IEntity;
    removeChild(parent: IEntity, child: IEntity): void;
    registerEntity(entity: IEntity, ownerId: number): number;
    markDirty(entity: IEntity): boolean;
    isDirty(nid: number): boolean;
    clearDirty(): void;
    unregisterEntity(entity: IEntity, ownerId: number): void;
    getByNid(nid: number): IEntity;
    getParentNid(nid: number): number;
    getRootNid(nid: number): number;
    forEachEntityTree(rootNid: number, fn: (nid: number) => void): void;
    private buildEntityTree;
    getEntityTree(rootNid: number): number[];
    collectEntityTree(rootNid: number, out: number[]): number[];
    private buildEntityTreeDeletes;
    getEntityTreeDeletes(rootNid: number): number[];
    collectEntityTreeDeletes(rootNid: number, out: number[]): number[];
    private unregisterChildren;
    releaseDeferredIds(): void;
}
//# sourceMappingURL=LocalState.d.ts.map