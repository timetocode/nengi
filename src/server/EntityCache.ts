import { Schema } from '../common/binary/schema/Schema'
import { compareAndUpdateNObject, copyNObject, updateNObject } from '../common/binary/schema/util'
import { IEntity } from '../common/IEntity'

function diff(entity: IEntity, cache: IEntity, nschema: Schema) {
    if (!cache) {
        console.log('no cache')
        return []
    }
    return compareAndUpdateNObject(entity, cache, nschema)
}

export class EntityCache {
    cache: { [tick: number]: IEntity }
    diffCache: { [tick: number]: { [nid: number]: any[] } }
    //binaryDiffCache: { [tick: number]: { [nid: number]: any[] } }

    constructor() {
        this.cache = {}
        this.diffCache = {}
        //this.binaryDiffCache = {}
    }

    cacheContains(nid: number): boolean {
        return !!this.cache[nid]
    }

    createCachesForTick(tick: number) {
        this.diffCache[tick] = {}
        //this.binaryDiffCache[tick] = {}
    }

    deleteCachesForTick(tick: number) {
        delete this.diffCache[tick]
        //delete this.binaryDiffCache[tick]
    }

    getAndDiff(tick: number, entity: IEntity, nschema: Schema) {
        if (this.diffCache[tick][entity.nid]){
            return this.diffCache[tick][entity.nid]
        } else {
            const cacheObject = this.cache[entity.nid]
            const diffs = diff(entity, cacheObject, nschema)
            this.diffCache[tick][entity.nid] = diffs
            return diffs
        }
    }

    cacheify(tick: number, entity: IEntity, nschema: Schema) {
        this.cache[entity.nid] = copyNObject(entity, nschema)
    }

    updateCache(tick: number, entity: IEntity, nschema: Schema) {
        const cacheObject = this.cache[entity.nid]
        updateNObject(entity, cacheObject, nschema)
    }
}

