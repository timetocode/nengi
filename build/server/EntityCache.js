"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityCache = void 0;
const util_1 = require("../common/binary/schema/util");
function diff(entity, cache, nschema) {
    if (!cache) {
        console.log('no cache');
        return [];
    }
    return (0, util_1.compareAndUpdateNObject)(entity, cache, nschema);
}
class EntityCache {
    //binaryDiffCache: { [tick: number]: { [nid: number]: any[] } }
    constructor() {
        this.cache = {};
        this.diffCache = {};
        this.groupedDiffCache = {};
        //this.binaryDiffCache = {}
    }
    cacheContains(nid) {
        return !!this.cache[nid];
    }
    createCachesForTick(tick) {
        this.diffCache[tick] = {};
        this.groupedDiffCache[tick] = {};
        //this.binaryDiffCache[tick] = {}
    }
    deleteCachesForTick(tick) {
        delete this.diffCache[tick];
        delete this.groupedDiffCache[tick];
        //delete this.binaryDiffCache[tick]
    }
    getAndDiffGrouped(tick, entity, nschema) {
        if (this.groupedDiffCache[tick][entity.nid]) {
            return this.groupedDiffCache[tick][entity.nid];
        }
        else {
            const cacheObject = this.cache[entity.nid];
            const diffs = (0, util_1.compareAndUpdateNObjectGrouped)(entity, cacheObject, nschema);
            this.groupedDiffCache[tick][entity.nid] = diffs;
            return diffs;
        }
    }
    getAndDiff(tick, entity, nschema) {
        if (this.diffCache[tick][entity.nid]) {
            return this.diffCache[tick][entity.nid];
        }
        else {
            const cacheObject = this.cache[entity.nid];
            const diffs = diff(entity, cacheObject, nschema);
            this.diffCache[tick][entity.nid] = diffs;
            return diffs;
        }
    }
    cacheify(tick, entity, nschema) {
        this.cache[entity.nid] = (0, util_1.copyNObject)(entity, nschema);
    }
    updateCache(tick, entity, nschema) {
        const cacheObject = this.cache[entity.nid];
        (0, util_1.updateNObject)(entity, cacheObject, nschema);
    }
}
exports.EntityCache = EntityCache;
