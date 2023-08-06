'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.EntityCache = void 0
const BinaryExt_1 = require('../common/binary/BinaryExt')
function diff(entity, cache, nschema) {
    if (!cache) {
        console.log('no cache')
        return []
    }
    const diffs = []
    for (let i = 0; i < nschema.keys.length; i++) {
        const { prop, type } = nschema.keys[i]
        const oldValue = cache[prop]
        const value = entity[prop]
        const binaryUtil = (0, BinaryExt_1.binaryGet)(type)
        if (!binaryUtil.compare(oldValue, value)) {
            diffs.push({ nid: entity.nid, nschema, prop, value })
            cache[prop] = binaryUtil.clone(value)
        }
    }
    return diffs
}
class EntityCache {
    constructor() {
        this.cache = {}
        this.diffCache = {}
        this.binaryDiffCache = {}
    }
    cacheContains(nid) {
        return !!this.cache[nid]
    }
    createCachesForTick(tick) {
        //this.cache[tick] = {}
        this.diffCache[tick] = {}
        this.binaryDiffCache[tick] = {}
    }
    deleteCachesForTick(tick) {
        //delete this.cache[tick]
        delete this.diffCache[tick]
        delete this.binaryDiffCache[tick]
    }
    getAndDiff(tick, entity, nschema) {
        if (this.diffCache[tick][entity.nid]) {
            return this.diffCache[tick][entity.nid]
        }
        else {
            const cacheObject = this.cache[entity.nid]
            const diffs = diff(entity, cacheObject, nschema)
            this.diffCache[tick][entity.nid] = diffs
            return diffs
        }
    }
    cacheify(tick, entity, schema) {
        const cacheObject = {}
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i]
            const value = entity[propData.prop]
            const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type)
            // @ts-ignore
            cacheObject[propData.prop] = binaryUtil.clone(value)
        }
        this.cache[entity.nid] = cacheObject
    }
    updateCache(tick, entity, schema) {
        const cacheObject = this.cache[entity.nid]
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i]
            const value = entity[propData.prop]
            const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type)
            // @ts-ignore
            cacheObject[propData.prop] = binaryUtil.clone(value)
        }
    }
}
exports.EntityCache = EntityCache
//# sourceMappingURL=EntityCache.js.map