"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RESPONSES_PER_FRAME = void 0;
exports.collectSkipInterpolationNids = collectSkipInterpolationNids;
exports.collectSnapshotPlan = collectSnapshotPlan;
const ChannelHeader_1 = require("../../common/ChannelHeader");
const SnapshotPlan_1 = require("./SnapshotPlan");
const messageFragments_1 = require("./messageFragments");
const MAX_RESPONSES_PER_FRAME = 255;
exports.MAX_RESPONSES_PER_FRAME = MAX_RESPONSES_PER_FRAME;
function collectSkipInterpolationNids(user) {
    const nids = [];
    const seen = new Set();
    for (const channel of user.subscriptions.values()) {
        const skipInterpolationNids = channel.skipInterpolationNids;
        if (!skipInterpolationNids || skipInterpolationNids.length === 0) {
            continue;
        }
        const state = user.getChannelVisibilityState(channel.nid);
        for (let i = 0; i < skipInterpolationNids.length; i++) {
            const nid = skipInterpolationNids[i];
            if (seen.has(nid) || !state.tickLastSeen.has(nid)) {
                continue;
            }
            seen.add(nid);
            nids.push(nid);
        }
    }
    return nids;
}
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
    const { toCreate, toUpdate, toDelete } = user.checkVisibility(instance.tick);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const channelOpens = user.consumePendingChannelOpens();
    for (let i = 0; i < channelOpens.length; i++) {
        const channel = user.subscriptions.get(channelOpens[i]);
        if (channel) {
            plan.channelOpens.push({ channelId: channel.nid, header: channel.header });
        }
    }
    const channelCloses = user.consumePendingChannelCloses();
    for (let i = 0; i < channelCloses.length; i++) {
        plan.channelCloses.push({ channelId: channelCloses[i] });
    }
    plan.skipInterpolationNids = collectSkipInterpolationNids(user);
    for (const channel of user.subscriptions.values()) {
        const header = channel.header;
        const headerVersion = channel.headerVersion || 0;
        if (!(0, ChannelHeader_1.hasSchemaBackedChannelHeader)(header) || headerVersion <= 0) {
            continue;
        }
        const knownVersion = user.knownChannelHeaderVersions.get(channel.nid);
        const nschema = instance.context.getSchema(header.ntype);
        if (knownVersion === undefined) {
            if (!instance.cache.cacheContains(header.nid)) {
                instance.cache.cacheify(instance.tick, header, nschema);
            }
            plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion });
        }
        else if (knownVersion < headerVersion) {
            const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema);
            if (diffs.changes.length > 0 || diffs.groups.length > 0) {
                plan.channelHeaderUpdates.push({
                    channelId: channel.nid,
                    changes: diffs.changes,
                    groups: diffs.groups
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
    plan.interpolatedMessages = user.interpolatedMessageQueue;
    user.interpolatedMessageQueue = [];
    plan.interpolatedMessages.push(...(0, messageFragments_1.collectInterpolatedBroadcastMessages)(user));
    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME);
    return plan;
}
