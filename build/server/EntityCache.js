"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityCache = void 0;
const BinaryExt_1 = require("../common/binary/BinaryExt");
function compareEntityAndCache(entity, cache, nschema) {
    if (!cache) {
        console.log('no cache');
        return [];
    }
    const { nid } = entity;
    const diffs = [];
    // start at 2, because key 0 = ntype, and key 1 = nid; both are static
    for (let i = 2; i < nschema.keys.length; i++) {
        const { prop, type } = nschema.keys[i];
        const oldValue = cache[prop];
        const value = entity[prop];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(type);
        if (!binaryUtil.compare(oldValue, value)) {
            diffs.push({ nid, nschema, prop, value });
            cache[prop] = binaryUtil.clone(value);
        }
    }
    return diffs;
}
class EntityCache {
    constructor() {
        this.cache = {};
        this.diffCache = {};
    }
    cacheContains(nid) {
        return !!this.cache[nid];
    }
    createCachesForTick(tick) {
        this.diffCache[tick] = {};
    }
    deleteCachesForTick(tick) {
        delete this.diffCache[tick];
    }
    getChangedProperties(tick, entity, nschema) {
        if (this.diffCache[tick][entity.nid]) {
            return this.diffCache[tick][entity.nid];
        }
        else {
            const cacheObject = this.cache[entity.nid];
            const changedProperties = compareEntityAndCache(entity, cacheObject, nschema);
            this.diffCache[tick][entity.nid] = changedProperties;
            return changedProperties;
        }
    }
    cacheify(tick, entity, schema) {
        const cacheObject = {};
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i];
            const value = entity[propData.prop];
            const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
            // @ts-ignore
            cacheObject[propData.prop] = binaryUtil.clone(value);
        }
        this.cache[entity.nid] = cacheObject;
    }
    updateCache(tick, entity, schema) {
        const cacheObject = this.cache[entity.nid];
        for (let i = 0; i < schema.keys.length; i++) {
            const propData = schema.keys[i];
            const value = entity[propData.prop];
            const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
            // @ts-ignore
            cacheObject[propData.prop] = binaryUtil.clone(value);
        }
    }
}
exports.EntityCache = EntityCache;
