import { IEntity } from '../common/IEntity';
type nid = number;
type arrayIndex = number;
export declare class NDictionary {
    array: IEntity[];
    nidIndex: Map<nid, arrayIndex>;
    get(nid: nid): IEntity;
    add(entity: IEntity): void;
    remove(entity: IEntity): void;
    removeAll(): void;
    forEach(fn: (entity: IEntity, index: number) => any): void;
    get size(): number;
}
export {};
//# sourceMappingURL=NDictionary.d.ts.map