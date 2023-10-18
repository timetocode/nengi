import { binaryGet } from '../common/binary/BinaryExt'
import { Schema } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'

type EntityPropertyChanges = { nid: number, nschema: Schema, prop: string, value: any }[]

function compareEntityAndCache(entity: IEntity, cache: any, nschema: Schema): EntityPropertyChanges {
    if (!cache) {
        console.log('no cache')
        return []
    }

    const { nid } = entity
    const diffs: EntityPropertyChanges = []
    // start at 2, because key 0 = ntype, and key 1 = nid; both are static
    for (let i = 2; i < nschema.keys.length; i++) {
        const { prop, type } = nschema.keys[i]
        const oldValue = cache[prop]
        const value = entity[prop]        
        const binaryUtil = binaryGet(type)
        if (!binaryUtil.compare(oldValue, value)) {
            diffs.push({ nid, nschema, prop, value })
            cache[prop] = binaryUtil.clone(value)
        }
        
    }
    return diffs
}

export class EntityCache {
    cache: { [tick: number]: { [nid: number]: any } } = {}
    diffCache: { [tick: number]: { [nid: number]: EntityPropertyChanges } } = {}

    cacheContains(nid: number): boolean {
        return !!this.cache[nid]
    }

    createCachesForTick(tick: number) {
        this.diffCache[tick] = {}
    }

    deleteCachesForTick(tick: number) {
        delete this.diffCache[tick]
    }

    getChangedProperties(tick: number, entity: IEntity, nschema: Schema): EntityPropertyChanges {
        if (this.diffCache[tick][entity.nid]){
            return this.diffCache[tick][entity.nid]
        } else {
            const cacheObject = this.cache[entity.nid]
            const changedProperties = compareEntityAndCache(entity, cacheObject, nschema)
            this.diffCache[tick][entity.nid] = changedProperties
            return changedProperties
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