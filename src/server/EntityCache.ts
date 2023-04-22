import { Schema } from '../common/binary/schema/Schema'
import IEntity from '../common/IEntity'

function diff(entity: any, cache: any, nschema: Schema) {
    if (!cache) {
        console.log('no cache')
        return []
    }

    const diffs: any[] = []
    
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const oldValue = cache[propData.prop]
        const value = entity[propData.prop]
        // TODO use the correct diff
        if (oldValue !== value) {
            diffs.push({ nid: entity.nid, nschema, prop: propData.prop, value })
            cache[propData.prop] = value
            //diffs.push([propData.prop, value])
        }
    }
    return diffs
}

function diff2(entity: any, cache: any, nschema: Schema) {
    if (!cache) {
        //console.log('no cache')
        return []
    }

    const diffs: any[] = []



    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const oldValue = cache[propData.prop]
        const value = entity[propData.prop]
        if (oldValue !== value) {
            diffs.push({ prop: propData.prop, value })
            cache[propData.prop] = value
            //diffs.push([propData.prop, value])
        }
    }
    return diffs
}

/*
function diffAll(entities: any, cache: any) {
    const diffs: any[] = []

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        const eCache = cache[entity.nid]
        const eDiffs = diff(entity, eCache)
        if (eDiffs.length > 0) {
            diffs.push({ nid: entity.nid, diffs: eDiffs })
        }
    }
    return diffs
}
*/


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
            //console.log(cacheObject)
            const diffs = diff(entity, cacheObject, nschema)
            this.diffCache[tick][entity.nid] = diffs


            return diffs
        }
    }

    cacheify(tick: number, entity: IEntity, schema: Schema) {
        //console.log('caching', entity.nid)
        const cacheObject = {}

        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i]
            const value = entity[propData.prop]
            // @ts-ignore
            cacheObject[propData.prop] = value
        }

        this.cache[entity.nid] = cacheObject
    }

    updateCache(tick: number, entity: IEntity, schema: Schema) {
        //console.log('updating cache', entity.nid)
        const cacheObject = this.cache[entity.nid]

        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i]
            const value = entity[propData.prop]
            // @ts-ignore
            cacheObject[propData.prop] = value
        }

        // console.log({ cacheObject })
    }


}

export default EntityCache