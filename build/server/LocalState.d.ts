import { IdPool } from './IdPool';
import { NDictionary } from './NDictionary';
type nid = number;
type parentNid = nid;
type childNid = nid;
interface IEntity {
    nid: nid;
    ntype: number;
}
export declare class LocalState {
    nidPool: IdPool;
    children: Map<parentNid, Set<childNid>>;
    parents: Map<childNid, Set<parentNid>>;
    _entities: NDictionary;
    addEntity(entity: IEntity): void;
    addChild(child: IEntity, parent: IEntity): void;
    removeEntity(entity: IEntity): void;
    getByNid(nid: number): IEntity;
}
export {};
//# sourceMappingURL=LocalState.d.ts.map