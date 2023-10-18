import { Schema } from '../common/binary/schema/Schema';
import { IEntity } from '../common/IEntity';
type EntityPropertyChanges = {
    nid: number;
    nschema: Schema;
    prop: string;
    value: any;
}[];
export declare class EntityCache {
    cache: {
        [tick: number]: {
            [nid: number]: any;
        };
    };
    diffCache: {
        [tick: number]: {
            [nid: number]: EntityPropertyChanges;
        };
    };
    cacheContains(nid: number): boolean;
    createCachesForTick(tick: number): void;
    deleteCachesForTick(tick: number): void;
    getChangedProperties(tick: number, entity: IEntity, nschema: Schema): EntityPropertyChanges;
    cacheify(tick: number, entity: IEntity, schema: Schema): void;
    updateCache(tick: number, entity: IEntity, schema: Schema): void;
}
export {};
//# sourceMappingURL=EntityCache.d.ts.map