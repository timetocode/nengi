"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffAll = exports.diff = void 0;
function diff(entity, cache) {
    if (!cache) {
        //console.log('no cache')
        return [];
    }
    const diffs = [];
    const schema = entity.schema;
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i];
        const oldValue = cache[propData.prop];
        const value = entity[propData.prop];
        if (oldValue !== value) {
            diffs.push({ prop: propData.prop, value });
            //diffs.push([propData.prop, value])
        }
    }
    /*
    schema.keys.forEach((propData: any) => {
        const oldValue = cache[propData.prop]
        const value = entity[propData.prop]
        if (oldValue !== value) {
            diffs.push({ prop: propData.prop, value })
        }
          
    })
    */
    return diffs;
}
exports.diff = diff;
function diffAll(entities, cache) {
    const diffs = [];
    //entities = Array.from(entities.values())
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eCache = cache[entity.nid];
        const eDiffs = diff(entity, eCache);
        if (eDiffs.length > 0) {
            diffs.push({ nid: entity.nid, diffs: eDiffs });
        }
    }
    /*
    entities = Array.from(entities.values())
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        const eCache = cache.get(entity.nid)
        const eDiffs = diff(entity, eCache)
        if (eDiffs.length > 0) {
            diffs.push({ nid: entity.nid, diffs: eDiffs })
        }
    }
    */
    /*
    entities.forEach((entity: any) => {
        const eCache = cache.get(entity.nid)
        const eDiffs = diff(entity, eCache)
        if (eDiffs.length > 0) {
            diffs.push({ nid: entity.nid, diffs: eDiffs })
        }
    })
    */
    return diffs;
}
exports.diffAll = diffAll;
