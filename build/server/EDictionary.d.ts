import { IEntity } from '../common/IEntity';
declare class EDictionary {
    object: {
        [key: string]: any;
    };
    array: IEntity[];
    constructor();
    get size(): number;
    get(nid: number): any;
    forEach(fn: (entity: IEntity, index: number) => any): void;
    toArray(): IEntity[];
    add(obj: IEntity): void;
    remove(obj: IEntity): any;
    removeById(id: number): any;
}
export { EDictionary };
