import { binaryGet } from '../common/binary/BinaryExt'
import { Schema } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'

function diff(entity: any, cache: any, nschema: Schema) {
    if (!cache) {
        console.log('no cache')
        return []
    }

    const diffs: any[] = []
    
    for (let i = 0; i < nschema.keys.length; i++) {
        const { prop, type } = nschema.keys[i]
        const oldValue = cache[prop]
        const value = entity[prop]
        const binaryUtil = binaryGet(type)
        if (!binaryUtil.compare(oldValue, value)) {
            diffs.push({ nid: entity.nid, nschema, prop, value })
            cache[prop] = binaryUtil.clone(value)
        }
    }
    return diffs
}

class EntityCache {
    cache: { [tick: number]:  { [nid: number]: any } }
    // tick { nid: [diff1, diff2]}
    diffCache: { [tick: number]:  { [nid: number]: any[] } }
    binaryDiffCache: { [tick: number]:  { [nid: number]: any[] } }

    constructor() {
        this.cache = {}
        this.diffCache = {}
        this.binaryDiffCache = {}
    }

    cacheContains(nid: number): boolean {
        return !!this.cache[nid]
    }

    createCachesForTick(tick: number) {
        //this.cache[tick] = {}
        this.diffCache[tick] = {}
        this.binaryDiffCache[tick] = {}
     }

    deleteCachesForTick(tick: number) {
        //delete this.cache[tick]
        delete this.diffCache[tick]
        delete this.binaryDiffCache[tick]
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

    cacheify(tick: number, entity: IEntity, schema: Schema) {
        const cacheObject = {}
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i]
            const value = entity[propData.prop]
            const binaryUtil = binaryGet(propData.type)
            // @ts-ignore
            cacheObject[propData.prop] = binaryUtil.clone(value)
        }
        this.cache[entity.nid] = cacheObject
    }

    updateCache(tick: number, entity: IEntity, schema: Schema) {
        const cacheObject = this.cache[entity.nid]
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i]
            const value = entity[propData.prop]
            const binaryUtil = binaryGet(propData.type)
            // @ts-ignore
            cacheObject[propData.prop] = binaryUtil.clone(value)
        }
    }


}

export { EntityCache }