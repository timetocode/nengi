"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RESPONSES_PER_FRAME = void 0;
exports.collectSnapshotPlan = collectSnapshotPlan;
const SnapshotPlan_1 = require("./SnapshotPlan");
const MAX_RESPONSES_PER_FRAME = 255;
exports.MAX_RESPONSES_PER_FRAME = MAX_RESPONSES_PER_FRAME;
function collectCreateEntities(instance, toCreate) {
    const createEntities = [];
    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        if (nschema) {
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema);
            }
            createEntities.push(entity);
        }
        else {
            throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`);
        }
    }
    return createEntities;
}
function collectUpdateEntities(instance, toUpdate) {
    const updateEntities = [];
    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        const diffs = instance.cache.getAndDiff(instance.tick, entity, nschema);
        for (let j = 0; j < diffs.length; j++) {
            updateEntities.push(diffs[j]);
        }
    }
    return updateEntities;
}
function collectSnapshotPlan(user, instance) {
    const { toCreate, toUpdate, toDelete } = user.checkVisibility(instance.tick);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.createEntities = collectCreateEntities(instance, toCreate);
    plan.updateEntities = collectUpdateEntities(instance, toUpdate);
    plan.deleteEntities = toDelete;
    plan.engineMessages = user.engineMessageQueue;
    user.engineMessageQueue = [];
    plan.messages = user.messageQueue;
    user.messageQueue = [];
    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME);
    return plan;
}
