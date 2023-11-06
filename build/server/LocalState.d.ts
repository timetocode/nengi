import { IdPool } from './IdPool';
import { IEntity } from '../common/IEntity';
import { NDictionary } from './NDictionary';
export declare class LocalState {
    nidPool: IdPool;
    sources: Map<number, Set<number>>;
    children: Map<number, Set<number>>;
    _entities: NDictionary;
    addChild(parentNid: number, child: IEntity): void;
    removeChild(parentNid: number, child: IEntity): void;
    registerEntity(entity: IEntity, sourceId: number): number;
    unregisterEntity(entity: IEntity, sourceId: number): void;
    getByNid(nid: number): IEntity;
}
//# sourceMappingURL=LocalState.d.ts.map