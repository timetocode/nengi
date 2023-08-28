import { IEntity } from '../common/IEntity';
declare class EDictionary {
    object: {
        [key: string]: any;
    };
    array: IEntity[];
    constructor();
    get size(): number;
    get(nid: number): any;
    /**
     * invokes the provided function each entity in the dictionary, passing the entity and index to the function
     * unsafe if used to remove entities from the dictionary as this will modify the index incorrectly
     * @param fn
     */
    forEach(fn: (entity: IEntity, index: number) => any): void;
    /**
     * invokes the provided function each entity in the dictionary, passing the entity and index to the function
     * navigates in reverse, thus is safe for removing entities
     * @param fn
     */
    forEachReverse(fn: (entity: IEntity, index: number) => any): void;
    toArray(): IEntity[];
    add(obj: IEntity): void;
    remove(obj: IEntity): any;
    removeById(id: number): any;
    bulkRemove(entitiesOrIds: Array<IEntity | number>): void;
}
export { EDictionary };
//# sourceMappingURL=EDictionary.d.ts.map