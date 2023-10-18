import { IdPool } from './IdPool';
export declare class NDictionary {
    array: IEntity[];
    nidIndex: Map<nid, arrayIndex>;
    get(nid: nid): IEntity;
    add(entity: IEntity): void;
    remove(entity: IEntity): void;
    forEach(fn: (entity: IEntity, index: number) => any): void;
}
type nid = number;
type parentNid = nid;
type childNid = nid;
type arrayIndex = number;
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
//# sourceMappingURL=Relations.test.d.ts.map