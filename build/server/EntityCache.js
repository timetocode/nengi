"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function diff(entity, cache, nschema) {
    if (!cache) {
        console.log('no cache');
        return [];
    }
    const diffs = [];
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const oldValue = cache[propData.prop];
        const value = entity[propData.prop];
        if (oldValue !== value) {
            diffs.push({ nid: entity.nid, nschema, prop: propData.prop, value });
            cache[propData.prop] = value;
            //diffs.push([propData.prop, value])
        }
    }
    return diffs;
}
function diff2(entity, cache, nschema) {
    if (!cache) {
        //console.log('no cache')
        return [];
    }
    const diffs = [];
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const oldValue = cache[propData.prop];
        const value = entity[propData.prop];
        if (oldValue !== value) {
            diffs.push({ prop: propData.prop, value });
            cache[propData.prop] = value;
            //diffs.push([propData.prop, value])
        }
    }
    return diffs;
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
    constructor() {
        this.cache = {};
        this.diffCache = {};
        this.binaryDiffCache = {};
    }
    cacheContains(nid) {
        return !!this.cache[nid];
    }
    createCachesForTick(tick) {
        //this.cache[tick] = {}
        this.diffCache[tick] = {};
        this.binaryDiffCache[tick] = {};
    }
    deleteCachesForTick(tick) {
        //delete this.cache[tick]
        delete this.diffCache[tick];
        delete this.binaryDiffCache[tick];
    }
    getAndDiff(tick, entity, nschema) {
        if (this.diffCache[tick][entity.nid]) {
            return this.diffCache[tick][entity.nid];
        }
        else {
            const cacheObject = this.cache[entity.nid];
            //console.log(cacheObject)
            const diffs = diff(entity, cacheObject, nschema);
            this.diffCache[tick][entity.nid] = diffs;
            return diffs;
        }
    }
    cacheify(tick, entity, schema) {
        //console.log('caching', entity.nid)
        const cacheObject = {};
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i];
            const value = entity[propData.prop];
            // @ts-ignore
            cacheObject[propData.prop] = value;
        }
        this.cache[entity.nid] = cacheObject;
    }
    updateCache(tick, entity, schema) {
        //console.log('updating cache', entity.nid)
        const cacheObject = this.cache[entity.nid];
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i];
            const value = entity[propData.prop];
            // @ts-ignore
            cacheObject[propData.prop] = value;
        }
        // console.log({ cacheObject })
    }
}
exports.default = EntityCache;
