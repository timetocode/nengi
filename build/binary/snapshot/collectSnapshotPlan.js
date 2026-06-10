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
    const updateEntityGroups = [];
    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i];
        const entity = instance.localState.getByNid(nid);
        const nschema = instance.context.getSchema(entity.ntype);
        const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema);
        for (let j = 0; j < diffs.groups.length; j++) {
            updateEntityGroups.push(diffs.groups[j]);
        }
        for (let j = 0; j < diffs.changes.length; j++) {
            updateEntities.push(diffs.changes[j]);
        }
    }
    return { updates: updateEntities, groups: updateEntityGroups };
}
function collectSnapshotPlan(user, instance) {
    var _a;
    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkVisibility(instance.tick);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const headerDeletes = user.consumePendingChannelHeaderDeletes();
    for (let i = 0; i < headerDeletes.length; i++) {
        plan.channelHeaderDeletes.push({ channelId: headerDeletes[i] });
    }
    plan.channelEntityCreates = channelEntityCreates;
    for (const channel of user.subscriptions.values()) {
        const header = channel.header || ((_a = channel.getHeader) === null || _a === void 0 ? void 0 : _a.call(channel));
        const headerVersion = channel.headerVersion || 0;
        if (!header || headerVersion <= 0) {
            continue;
        }
        const knownVersion = user.knownChannelHeaderVersions.get(channel.nid);
        const nschema = instance.context.getSchema(header.ntype);
        if (knownVersion === undefined) {
            if (!instance.cache.cacheContains(header.nid)) {
                instance.cache.cacheify(instance.tick, header, nschema);
            }
            plan.channelHeaderCreates.push({ channelId: channel.nid, header, version: headerVersion });
            plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion });
        }
        else if (knownVersion < headerVersion) {
            const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema);
            if (diffs.changes.length > 0 || diffs.groups.length > 0) {
                plan.channelHeaderUpdates.push({
                    channelId: channel.nid,
                    changes: diffs.changes,
                    groups: diffs.groups,
                    version: headerVersion
                });
            }
            plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion });
        }
    }
    plan.createEntities = collectCreateEntities(instance, toCreate);
    const updates = collectUpdateEntities(instance, toUpdate);
    plan.updateEntities = updates.updates;
    plan.updateEntityGroups = updates.groups;
    plan.deleteEntities = toDelete;
    plan.engineMessages = user.engineMessageQueue;
    user.engineMessageQueue = [];
    plan.messages = user.messageQueue;
    user.messageQueue = [];
    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME);
    return plan;
}
