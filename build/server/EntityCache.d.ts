import { Schema } from '../common/binary/schema/Schema';
import { IEntity } from '../common/IEntity';
export declare class EntityCache {
    cache: {
        [tick: number]: IEntity;
    };
    diffCache: {
        [tick: number]: {
            [nid: number]: any[];
        };
    };
    constructor();
    cacheContains(nid: number): boolean;
    createCachesForTick(tick: number): void;
    deleteCachesForTick(tick: number): void;
    getAndDiff(tick: number, entity: IEntity, nschema: Schema): any[];
    cacheify(tick: number, entity: IEntity, nschema: Schema): void;
    updateCache(tick: number, entity: IEntity, nschema: Schema): void;
}
//# sourceMappingURL=EntityCache.d.ts.map