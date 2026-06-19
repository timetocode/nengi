"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectChannelUpdatePlan = collectChannelUpdatePlan;
exports.collectSpatialCellUpdatePlan = collectSpatialCellUpdatePlan;
exports.collectEntityUpdatePlan = collectEntityUpdatePlan;
exports.collectCreateEntitiesForRoots = collectCreateEntitiesForRoots;
exports.collectNidsForRoots = collectNidsForRoots;
exports.addRegularCreate = addRegularCreate;
exports.addRegularUpdate = addRegularUpdate;
const SnapshotPlan_1 = require("./SnapshotPlan");
function collectChannelUpdatePlan(instance, channel, excludedNids) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const entities = channel.entities.array;
    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            if (excludedNids === null || excludedNids === void 0 ? void 0 : excludedNids.has(nid)) {
                return;
            }
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan);
        });
    }
    return plan;
}
function collectSpatialCellUpdatePlan(instance, channel, cellKey) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const entities = channel.getCellEntities(cellKey);
    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan);
        });
    }
    return plan;
}
function collectEntityUpdatePlan(instance, entity, plan) {
    const nschema = instance.context.getSchema(entity.ntype);
    const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema);
    for (let j = 0; j < diffs.groups.length; j++) {
        plan.updateEntityGroups.push(diffs.groups[j]);
    }
    for (let j = 0; j < diffs.changes.length; j++) {
        plan.updateEntities.push(diffs.changes[j]);
    }
}
function collectCreateEntitiesForRoots(instance, roots) {
    const createEntities = [];
    const nids = new Set();
    for (let i = 0; i < roots.length; i++) {
        instance.localState.forEachEntityTree(roots[i].nid, nid => {
            const entity = instance.localState.getByNid(nid);
            const nschema = instance.context.getSchema(entity.ntype);
            if (!nschema) {
                throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`);
            }
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema);
            }
            createEntities.push(entity);
            nids.add(nid);
        });
    }
    return { createEntities, nids };
}
function collectNidsForRoots(instance, roots) {
    const nids = new Set();
    for (let i = 0; i < roots.length; i++) {
        instance.localState.forEachEntityTree(roots[i].nid, nid => {
            nids.add(nid);
        });
    }
    return nids;
}
function addRegularCreate(plan, instance, nid) {
    const entity = instance.localState.getByNid(nid);
    const nschema = instance.context.getSchema(entity.ntype);
    if (!nschema) {
        throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`);
    }
    if (!instance.cache.cacheContains(nid)) {
        instance.cache.cacheify(instance.tick, entity, nschema);
    }
    plan.createEntities.push(entity);
}
function addRegularUpdate(plan, instance, nid) {
    const entity = instance.localState.getByNid(nid);
    collectEntityUpdatePlan(instance, entity, plan);
}
