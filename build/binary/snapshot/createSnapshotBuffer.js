"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSnapshot = exports.countSnapshotBytes = exports.commitSnapshotPlan = exports.getVisibleState = exports.collectSnapshotPlan = void 0;
const ChannelHeader_1 = require("../../common/ChannelHeader");
const collectSnapshotPlan_1 = require("./collectSnapshotPlan");
Object.defineProperty(exports, "collectSnapshotPlan", { enumerable: true, get: function () { return collectSnapshotPlan_1.collectSnapshotPlan; } });
Object.defineProperty(exports, "getVisibleState", { enumerable: true, get: function () { return collectSnapshotPlan_1.collectSnapshotPlan; } });
const commitSnapshotPlan_1 = require("./commitSnapshotPlan");
Object.defineProperty(exports, "commitSnapshotPlan", { enumerable: true, get: function () { return commitSnapshotPlan_1.commitSnapshotPlan; } });
const countSnapshotBytes_1 = require("./countSnapshotBytes");
Object.defineProperty(exports, "countSnapshotBytes", { enumerable: true, get: function () { return countSnapshotBytes_1.countSnapshotBytes; } });
const writeSnapshot_1 = require("./writeSnapshot");
Object.defineProperty(exports, "writeSnapshot", { enumerable: true, get: function () { return writeSnapshot_1.writeSnapshot; } });
const SnapshotPlan_1 = require("./SnapshotPlan");
const SnapshotChunk_1 = require("./SnapshotChunk");
const manualUpdates_1 = require("./manualUpdates");
const channelModes_1 = require("./channelModes");
const messageFragments_1 = require("./messageFragments");
const ecsSnapshotCrud_1 = require("./ecsSnapshotCrud");
const snapshotPlanStats_1 = require("./snapshotPlanStats");
const cellEntityFragments_1 = require("./cellEntityFragments");
const snapshotChunkBuilders_1 = require("./snapshotChunkBuilders");
const channelMessages_1 = require("./channelMessages");
const snapshotPayload_1 = require("./snapshotPayload");
function collectEnvelopePlan(user) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const queuedResponses = user.responseQueue.length;
    addEnvelopeQueues(plan, user);
    return { plan, queuedResponses };
}
function addEnvelopeQueues(plan, user) {
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
    plan.engineMessages = user.engineMessageQueue;
    user.engineMessageQueue = [];
    plan.skipInterpolationNids = (0, collectSnapshotPlan_1.collectSkipInterpolationNids)(user);
    plan.messages = user.messageQueue;
    user.messageQueue = [];
    plan.interpolatedMessages = user.interpolatedMessageQueue;
    user.interpolatedMessageQueue = [];
    plan.responses = user.responseQueue.slice(0, collectSnapshotPlan_1.MAX_RESPONSES_PER_FRAME);
}
function protocolWillChange(user, instance) {
    const protocol = instance.network.getProtocol();
    return user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType;
}
function canUseSharedUpdateFragment(user, channel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.membershipVersion &&
        user.currentlyVisible.length === countChannelVisibleEntities(user.instance, channel);
}
function channelHasHeaderPending(user, channel) {
    const header = channel.header;
    const headerVersion = channel.headerVersion || 0;
    if (!header || !(0, ChannelHeader_1.hasSchemaBackedChannelHeader)(header) || headerVersion <= 0) {
        return false;
    }
    return user.knownChannelHeaderVersions.get(channel.nid) !== headerVersion;
}
function canUseCellFragments(channel, userId) {
    const stableKeys = channel.getStableVisibleCellKeys(userId);
    if (stableKeys) {
        return stableKeys.length <= channel.stableFragmentCellLimit;
    }
    return channel.getVisibleCellKeys(userId).length <= channel.fragmentCellLimit;
}
function canUseSharedDeltaFragments(user, channel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.deltaBaseVersion;
}
function hasChannelDeltas(channel) {
    return channel.deltaBaseVersion !== channel.membershipVersion;
}
function rememberCellFragmentChannelVisibility(user) {
    for (const channel of user.subscriptions.values()) {
        if ((0, channelModes_1.isCellFragmentChannel)(channel)) {
            channel.rememberVisibleCells(user.id);
        }
    }
}
function writeEntityDeltaFragments(writer, instance, fragments) {
    if (fragments.creates) {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0;
        (0, snapshotPayload_1.writePayload)(writer, fragments.creates.payload);
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragments.creates.bytes);
        }
    }
    if (fragments.deletes) {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0;
        (0, snapshotPayload_1.writePayload)(writer, fragments.deletes.payload);
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragments.deletes.bytes);
        }
    }
}
function countEntityDeltaFragmentBytes(fragments) {
    var _a, _b;
    return (((_a = fragments.creates) === null || _a === void 0 ? void 0 : _a.bytes) || 0) + (((_b = fragments.deletes) === null || _b === void 0 ? void 0 : _b.bytes) || 0);
}
function countEntityDeltaFragmentCreates(fragments) {
    var _a;
    return ((_a = fragments.creates) === null || _a === void 0 ? void 0 : _a.creates) || 0;
}
function countEntityDeltaFragmentDeletes(fragments) {
    var _a;
    return ((_a = fragments.deletes) === null || _a === void 0 ? void 0 : _a.deletes) || 0;
}
function applySharedChannelDeltasToUser(user, channel, tick, fragments) {
    var _a, _b;
    const deletedNids = (_a = fragments.deletes) === null || _a === void 0 ? void 0 : _a.nids;
    if (deletedNids) {
        for (const nid of deletedNids) {
            user.tickLastSeen.delete(nid);
        }
        user.currentlyVisible = user.currentlyVisible.filter(nid => !deletedNids.has(nid));
    }
    for (let i = 0; i < user.currentlyVisible.length; i++) {
        user.tickLastSeen.set(user.currentlyVisible[i], tick);
    }
    const createdNids = (_b = fragments.creates) === null || _b === void 0 ? void 0 : _b.nids;
    if (createdNids) {
        for (const nid of createdNids) {
            user.markVisible(nid, tick, [], [], null, []);
        }
    }
    user.lastVisibleCount = user.currentlyVisible.length;
    user.sharedChannelVersions.set(channel.nid, channel.membershipVersion);
}
function applyCellEntityFragmentsToUser(user, tick, createFragments, deleteFragments) {
    if (deleteFragments.length > 0) {
        const deletedNids = new Set();
        for (let i = 0; i < deleteFragments.length; i++) {
            for (const nid of deleteFragments[i].nids) {
                deletedNids.add(nid);
                user.tickLastSeen.delete(nid);
            }
        }
        user.currentlyVisible = user.currentlyVisible.filter(nid => !deletedNids.has(nid));
    }
    for (let i = 0; i < user.currentlyVisible.length; i++) {
        user.tickLastSeen.set(user.currentlyVisible[i], tick);
    }
    for (let i = 0; i < createFragments.length; i++) {
        for (const nid of createFragments[i].nids) {
            user.markVisible(nid, tick, [], [], null, []);
        }
    }
    user.lastVisibleCount = user.currentlyVisible.length;
}
function rememberSharedChannelVersion(user) {
    const channel = (0, channelModes_1.getSingleSharedChannel)(user);
    if (!channel) {
        return;
    }
    if (user.currentlyVisible.length === countChannelVisibleEntities(user.instance, channel)) {
        user.sharedChannelVersions.set(channel.nid, channel.membershipVersion);
    }
}
function countEntityWithChildren(instance, nid) {
    let count = 1;
    const children = instance.localState.children.get(nid);
    if (children) {
        for (const childNid of children) {
            count += countEntityWithChildren(instance, childNid);
        }
    }
    return count;
}
function countChannelVisibleEntities(instance, channel) {
    if (instance.localState.children.size === 0) {
        return channel.entities.size;
    }
    let count = 0;
    const entityNids = channel.entityNids;
    for (let i = 0; i < entityNids.length; i++) {
        count += countEntityWithChildren(instance, entityNids[i]);
    }
    return count;
}
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
function hasSnapshotPlanContent(plan) {
    return plan.channelOpens.length > 0 ||
        plan.channelEntityCreates.length > 0 ||
        plan.channelHeaderUpdates.length > 0 ||
        plan.channelCloses.length > 0 ||
        plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.updateEntities.length > 0 ||
        plan.updateEntityGroups.length > 0 ||
        plan.deleteEntities.length > 0 ||
        plan.engineMessages.length > 0 ||
        plan.messages.length > 0 ||
        plan.interpolatedMessages.length > 0 ||
        plan.responses.length > 0;
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
function getCellCreateFragment(user, instance, channel, cellKey) {
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:cell:create:${cellKey}:${channel.getCellVersion(cellKey)}:${protocol.nidType}:${protocol.ntypeType}`;
    const cached = instance.network.sharedCreateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    const collected = collectCreateEntitiesForRoots(instance, channel.getCellEntities(cellKey));
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.createEntities = collected.createEntities;
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, instance.context, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, writeSnapshot_1.writeSnapshot)(plan, instance.context, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        nids: collected.nids,
        creates: plan.createEntities.length,
        deletes: 0,
        updateProps: 0,
        updateGroups: 0,
        groupedUpdateProps: 0
    };
    instance.network.sharedCreateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes });
    return fragment;
}
function getCellDeleteFragment(user, instance, channel, cellKey, nids) {
    const protocol = instance.network.getProtocol();
    const nidSignature = nids.join(',');
    const key = `${instance.tick}:${channel.nid}:cell:delete:${cellKey}:${nidSignature}:${protocol.nidType}`;
    const cached = instance.network.sharedDeleteFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.deleteEntities = nids;
    if (measure) {
        countStart = performance.now();
    }
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, instance.context, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, writeSnapshot_1.writeSnapshot)(plan, instance.context, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        nids: new Set(nids),
        creates: 0,
        deletes: nids.length,
        updateProps: 0,
        updateGroups: 0,
        groupedUpdateProps: 0
    };
    instance.network.sharedDeleteFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes });
    return fragment;
}
function getManualSpatialCellUpdateFragment(user, instance, channel, cellKey, includeNids = true) {
    const log = channel.getManualCellUpdateLog(cellKey);
    if (!log) {
        return {
            payload: user.networkAdapter.binary.createWriter(0).payload,
            bytes: 0,
            nids: new Set(),
            creates: 0,
            deletes: 0,
            updateProps: 0,
            updateGroups: 0,
            groupedUpdateProps: 0
        };
    }
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:manual-cell:update:${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`;
    const cached = instance.network.sharedUpdateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        countStart = performance.now();
    }
    const bytes = (0, manualUpdates_1.countManualUpdateBytes)(log, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, manualUpdates_1.writeManualUpdates)(log, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        nids: includeNids ? collectNidsForRoots(instance, channel.getCellEntities(cellKey)) : new Set(),
        creates: 0,
        deletes: 0,
        updateProps: log.manualPropNids.length,
        updateGroups: log.manualGroupNids.length,
        groupedUpdateProps: (0, manualUpdates_1.countManualGroupedProps)(log)
    };
    instance.network.sharedUpdateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes });
    return fragment;
}
function getCellUpdateFragment(user, instance, channel, cellKey, includeNids = true) {
    if ((0, channelModes_1.isManualSpatialCellFragmentChannel)(channel)) {
        return getManualSpatialCellUpdateFragment(user, instance, channel, cellKey, includeNids);
    }
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:cell:update:${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`;
    const cached = instance.network.sharedUpdateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    const plan = collectSpatialCellUpdatePlan(instance, channel, cellKey);
    const nids = includeNids ? collectNidsForRoots(instance, channel.getCellEntities(cellKey)) : new Set();
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, instance.context, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, writeSnapshot_1.writeSnapshot)(plan, instance.context, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        nids,
        creates: 0,
        deletes: 0,
        updateProps: plan.updateEntities.length,
        updateGroups: plan.updateEntityGroups.length,
        groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0)
    };
    instance.network.sharedUpdateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes });
    return fragment;
}
function cellMayHaveUpdates(channel, cellKey) {
    if ((0, channelModes_1.isManualSpatialCellFragmentChannel)(channel)) {
        return channel.cellHasManualUpdates(cellKey);
    }
    return true;
}
function getSharedCreateFragment(user, instance, channel) {
    if (channel.createdRoots.length === 0) {
        return null;
    }
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:create:${channel.deltaBaseVersion}:${channel.membershipVersion}:${protocol.nidType}:${protocol.ntypeType}`;
    const cached = instance.network.sharedCreateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    const collected = collectCreateEntitiesForRoots(instance, channel.createdRoots);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.createEntities = collected.createEntities;
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, instance.context, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, writeSnapshot_1.writeSnapshot)(plan, instance.context, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        creates: plan.createEntities.length,
        nids: collected.nids
    };
    instance.network.sharedCreateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes });
    return fragment;
}
function getSharedDeleteFragment(user, instance, channel) {
    if (channel.deletedNids.length === 0) {
        return null;
    }
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:delete:${channel.deltaBaseVersion}:${channel.membershipVersion}:${protocol.nidType}`;
    const cached = instance.network.sharedDeleteFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.deleteEntities = channel.deletedNids;
    if (measure) {
        countStart = performance.now();
    }
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, instance.context, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, writeSnapshot_1.writeSnapshot)(plan, instance.context, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        deletes: plan.deleteEntities.length,
        nids: new Set(plan.deleteEntities)
    };
    instance.network.sharedDeleteFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes });
    return fragment;
}
function getEntityDeltaFragments(user, instance, channel) {
    if (!instance.network.sharedUpdateFragmentsEnabled ||
        instance.network.debugBinaryWrites ||
        !canUseSharedDeltaFragments(user, channel)) {
        return { creates: null, deletes: null };
    }
    return {
        creates: getSharedCreateFragment(user, instance, channel),
        deletes: getSharedDeleteFragment(user, instance, channel)
    };
}
function getSharedUpdateFragment(user, instance, channel, excludedNids) {
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:${protocol.nidType}:${protocol.ntypeType}:${excludedNids ? 'delta' : 'steady'}`;
    const cached = instance.network.sharedUpdateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    const plan = collectChannelUpdatePlan(instance, channel, excludedNids);
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, instance.context, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, writeSnapshot_1.writeSnapshot)(plan, instance.context, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: plan.updateEntities.length,
        updateGroups: plan.updateEntityGroups.length,
        groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0)
    };
    instance.network.sharedUpdateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes });
    return fragment;
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
    const nschema = instance.context.getSchema(entity.ntype);
    const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema);
    for (let i = 0; i < diffs.groups.length; i++) {
        plan.updateEntityGroups.push(diffs.groups[i]);
    }
    for (let i = 0; i < diffs.changes.length; i++) {
        plan.updateEntities.push(diffs.changes[i]);
    }
}
function addChannelHeader(plan, user, instance, channel) {
    const header = channel.header;
    const headerVersion = channel.headerVersion || 0;
    if (!(0, ChannelHeader_1.hasSchemaBackedChannelHeader)(header) || headerVersion <= 0) {
        return;
    }
    const knownVersion = user.knownChannelHeaderVersions.get(channel.nid);
    const nschema = instance.context.getSchema(header.ntype);
    if (!nschema) {
        throw new Error(`Channel header [nid ${header.nid}] [ntype ${header.ntype}] is missing a network schema.`);
    }
    if (knownVersion === undefined) {
        if (!instance.cache.cacheContains(header.nid)) {
            instance.cache.cacheify(instance.tick, header, nschema);
        }
        plan.channelHeaderVersions.push({
            channelId: channel.nid,
            version: headerVersion
        });
        return;
    }
    if (knownVersion >= headerVersion) {
        return;
    }
    const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema);
    if (diffs.changes.length > 0 || diffs.groups.length > 0) {
        plan.channelHeaderUpdates.push({
            channelId: channel.nid,
            changes: diffs.changes,
            groups: diffs.groups
        });
    }
    plan.channelHeaderVersions.push({
        channelId: channel.nid,
        version: headerVersion
    });
}
function addEcsManualUpdates(plan, instance, channel, visibleUpdates) {
    for (let i = 0; i < channel.manualPropNids.length; i++) {
        const nid = channel.manualPropNids[i];
        if (!visibleUpdates.has(nid)) {
            continue;
        }
        const component = channel.getComponent(nid);
        if (!component) {
            continue;
        }
        const prop = channel.manualPropSchemas[i];
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(component.ntype),
            prop: prop.prop,
            value: channel.manualPropValues[i]
        });
    }
    for (let i = 0; i < channel.manualGroupNids.length; i++) {
        const nid = channel.manualGroupNids[i];
        if (!visibleUpdates.has(nid)) {
            continue;
        }
        const component = channel.getComponent(nid);
        if (!component) {
            continue;
        }
        const group = channel.manualGroupSchemas[i];
        const values = [];
        let offset = channel.manualGroupValueOffsets[i];
        for (let j = 0; j < group.props.length; j++) {
            values.push(channel.manualGroupValues[offset++]);
        }
        plan.updateEntityGroups.push({
            nid,
            nschema: instance.context.getSchema(component.ntype),
            group,
            values
        });
    }
}
function addManualUpdateLog(plan, instance, log, visibleUpdates) {
    for (let i = 0; i < log.manualPropNids.length; i++) {
        const nid = log.manualPropNids[i];
        if (!visibleUpdates.has(nid)) {
            continue;
        }
        const entity = instance.localState.getByNid(nid);
        if (!entity) {
            continue;
        }
        const prop = log.manualPropSchemas[i];
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(entity.ntype),
            prop: prop.prop,
            value: log.manualPropValues[i]
        });
    }
    for (let i = 0; i < log.manualGroupNids.length; i++) {
        const nid = log.manualGroupNids[i];
        if (!visibleUpdates.has(nid)) {
            continue;
        }
        const entity = instance.localState.getByNid(nid);
        if (!entity) {
            continue;
        }
        const group = log.manualGroupSchemas[i];
        const values = [];
        let offset = log.manualGroupValueOffsets[i];
        for (let j = 0; j < group.props.length; j++) {
            values.push(log.manualGroupValues[offset++]);
        }
        plan.updateEntityGroups.push({
            nid,
            nschema: instance.context.getSchema(entity.ntype),
            group,
            values
        });
    }
}
function addManualUpdates(plan, instance, channel, visibleUpdates) {
    addManualUpdateLog(plan, instance, channel, visibleUpdates);
}
function addManualSpatialUpdates(plan, instance, user, channel, visibleUpdates) {
    const cellKeys = channel.getVisibleCellKeys(user.id);
    for (let i = 0; i < cellKeys.length; i++) {
        const log = channel.getManualCellUpdateLog(cellKeys[i]);
        if (log) {
            addManualUpdateLog(plan, instance, log, visibleUpdates);
        }
    }
}
function ecsHasManualUpdates(channel) {
    return channel.manualPropNids.length > 0 || channel.manualGroupNids.length > 0;
}
function collectSubscribedChannelSnapshotPlan(user, instance, channel) {
    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    addChannelHeader(plan, user, instance, channel);
    plan.channelEntityCreates = channelEntityCreates;
    if ((0, channelModes_1.isEcsSnapshotChannel)(channel)) {
        (0, ecsSnapshotCrud_1.addEcsVisibilityCrud)(plan, channel, toCreate, toDelete);
        addEcsManualUpdates(plan, instance, channel, new Set(toUpdate));
        (0, channelMessages_1.addChannelMessages)(plan, user, channel, instance.network.debugBinaryWrites);
        return plan;
    }
    const visibleUpdates = new Set(toUpdate);
    const manualChannel = (0, channelModes_1.isManualUpdateChannel)(channel);
    const manualSpatialChannel = (0, channelModes_1.isManualSpatialCellFragmentChannel)(channel);
    for (let i = 0; i < toCreate.length; i++) {
        addRegularCreate(plan, instance, toCreate[i]);
    }
    if (!manualChannel && !manualSpatialChannel) {
        for (let i = 0; i < toUpdate.length; i++) {
            addRegularUpdate(plan, instance, toUpdate[i]);
        }
    }
    plan.deleteEntities = toDelete;
    if (manualChannel) {
        addManualUpdates(plan, instance, channel, visibleUpdates);
    }
    else if (manualSpatialChannel) {
        addManualSpatialUpdates(plan, instance, user, channel, visibleUpdates);
    }
    (0, channelMessages_1.addChannelMessages)(plan, user, channel, instance.network.debugBinaryWrites);
    return plan;
}
function collectPendingVisibilityDeletePlan(user) {
    const deletes = user.consumePendingVisibilityDeletes();
    if (deletes.length === 0) {
        return null;
    }
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.deleteEntities = deletes;
    return plan;
}
function collectManualSpatialVisibilityPlan(user, instance, channel) {
    const { toCreate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.channelEntityCreates = channelEntityCreates;
    for (let i = 0; i < toCreate.length; i++) {
        addRegularCreate(plan, instance, toCreate[i]);
    }
    plan.deleteEntities = toDelete;
    (0, channelMessages_1.addChannelMessages)(plan, user, channel, instance.network.debugBinaryWrites);
    return plan;
}
function collectStableEcsStructuralSnapshotBase(user, channel) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.ecsCreateEntities.push(...channel.createdRoots);
    plan.ecsCreateComponents.push(...channel.createdComponents);
    plan.ecsDeleteEntities.push(...channel.deletedRoots);
    plan.deleteEntities.push(...channel.deletedComponents);
    const deleteNids = new Set();
    for (let i = 0; i < channel.deletedRoots.length; i++) {
        deleteNids.add(channel.deletedRoots[i]);
    }
    for (let i = 0; i < channel.rootDeletedComponents.length; i++) {
        deleteNids.add(channel.rootDeletedComponents[i]);
    }
    for (let i = 0; i < channel.deletedComponents.length; i++) {
        deleteNids.add(channel.deletedComponents[i]);
    }
    if (deleteNids.size > 0) {
        for (let i = user.currentlyVisible.length - 1; i >= 0; i--) {
            const nid = user.currentlyVisible[i];
            if (deleteNids.has(nid)) {
                const last = user.currentlyVisible.pop();
                if (i < user.currentlyVisible.length) {
                    user.currentlyVisible[i] = last;
                }
                user.tickLastSeen.delete(nid);
            }
        }
    }
    for (let i = 0; i < channel.createdRoots.length; i++) {
        const nid = channel.createdRoots[i];
        (0, ecsSnapshotCrud_1.addEcsChannelEntityCreate)(plan, channel, nid);
        user.currentlyVisible.push(nid);
        user.tickLastSeen.set(nid, user.instance.tick);
    }
    for (let i = 0; i < channel.createdComponents.length; i++) {
        const nid = channel.createdComponents[i].nid;
        (0, ecsSnapshotCrud_1.addEcsChannelEntityCreate)(plan, channel, nid);
        user.currentlyVisible.push(nid);
        user.tickLastSeen.set(nid, user.instance.tick);
    }
    const visibleNids = channel.getVisibleNetworkedNids(user.id);
    user.stableVisibleRefs.set(channel.nid, visibleNids);
    user.lastVisibleCount = user.currentlyVisible.length;
    addEnvelopeQueues(plan, user);
    (0, channelMessages_1.addChannelMessages)(plan, user, channel, true);
    return { plan, toUpdate: [] };
}
function collectEcsSnapshotBase(user, instance, channel) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    if (!channel.hasStructuralDeltas()) {
        const visibleNids = channel.getVisibleNetworkedNids(user.id);
        if (user.stableVisibleRefs.get(channel.nid) === visibleNids &&
            user.currentlyVisible.length === visibleNids.length) {
            user.lastVisibleCount = user.currentlyVisible.length;
            addEnvelopeQueues(plan, user);
            (0, channelMessages_1.addChannelMessages)(plan, user, channel, true);
            return { plan, toUpdate: [] };
        }
    }
    if (channel.hasStructuralDeltas() &&
        !ecsHasManualUpdates(channel) &&
        user.stableVisibleRefs.has(channel.nid)) {
        return collectStableEcsStructuralSnapshotBase(user, channel);
    }
    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick);
    plan.channelEntityCreates = channelEntityCreates;
    (0, ecsSnapshotCrud_1.addEcsVisibilityCrud)(plan, channel, toCreate, toDelete);
    addEnvelopeQueues(plan, user);
    (0, channelMessages_1.addChannelMessages)(plan, user, channel, true);
    return { plan, toUpdate };
}
function hasEcsSnapshotCrud(plan) {
    return plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.deleteEntities.length > 0;
}
function createEcsSnapshotBuffer(user, instance, channel) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    const needsProtocolPrelude = protocolWillChange(user, instance);
    instance.network.queueProtocolIfChanged(user);
    const queuedResponses = user.responseQueue.length;
    const base = collectEcsSnapshotBase(user, instance, channel);
    const plan = base.plan;
    const protocol = instance.network.getProtocol();
    const writeManualLogDirectly = !hasEcsSnapshotCrud(plan);
    if (!writeManualLogDirectly) {
        addEcsManualUpdates(plan, instance, channel, new Set(base.toUpdate));
    }
    const manualFragment = writeManualLogDirectly &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites
        ? (0, manualUpdates_1.getManualUpdateFragment)(user, instance, channel, 'ecs-manual')
        : null;
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const chunks = [];
    if (needsProtocolPrelude) {
        chunks.push((0, snapshotChunkBuilders_1.createProtocolPreludeChunk)(instance, protocol));
    }
    chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol), (0, SnapshotChunk_1.createSnapshotPlanChunk)('EcsSnapshotPlan', plan, instance.context, protocol));
    if (manualFragment) {
        chunks.push((0, SnapshotChunk_1.createSnapshotChunk)('EcsManualUpdateFragment', manualFragment.bytes, writer => {
            const copyStart = measure ? performance.now() : 0;
            (0, snapshotPayload_1.writePayload)(writer, manualFragment.payload);
            if (measure) {
                instance.network.recordSharedFragmentCopy(performance.now() - copyStart, manualFragment.bytes);
            }
        }));
    }
    else if (writeManualLogDirectly) {
        chunks.push((0, SnapshotChunk_1.createSnapshotChunk)('EcsManualUpdates', (0, manualUpdates_1.countEcsManualUpdateBytes)(channel, protocol), writer => {
            (0, manualUpdates_1.writeEcsManualUpdates)(channel, writer, protocol);
        }));
    }
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer, {
        debug: instance.network.debugBinaryWrites,
        createWriter: byteLength => user.networkAdapter.binary.createWriter(byteLength)
    });
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, plan);
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        if (manualFragment) {
            instance.network.recordSharedSnapshot();
        }
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.ecsCreateEntities.length + plan.ecsCreateComponents.length,
            updateProps: manualFragment ? manualFragment.updateProps :
                writeManualLogDirectly ? channel.manualPropNids.length : plan.updateEntities.length,
            updateGroups: manualFragment ? manualFragment.updateGroups :
                writeManualLogDirectly ? channel.manualGroupNids.length : plan.updateEntityGroups.length,
            groupedUpdateProps: manualFragment ? manualFragment.groupedUpdateProps :
                writeManualLogDirectly ? (0, manualUpdates_1.countManualGroupedProps)(channel) :
                    plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0),
            deletes: plan.ecsDeleteEntities.length + plan.deleteEntities.length,
            messages: (0, snapshotPlanStats_1.countPlanMessages)(plan),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        });
    }
    return writer.payload;
}
function collectEcsSpatialSnapshotBase(user, instance, channel) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const { toCreate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick);
    plan.channelEntityCreates = channelEntityCreates;
    (0, ecsSnapshotCrud_1.addEcsVisibilityCrud)(plan, channel, toCreate, toDelete);
    addEnvelopeQueues(plan, user);
    (0, channelMessages_1.addChannelMessages)(plan, user, channel, true);
    return plan;
}
function getEcsSpatialCellUpdateFragment(user, instance, channel, cellKey) {
    const log = channel.getManualCellUpdateLog(cellKey);
    if (!log) {
        return null;
    }
    return (0, manualUpdates_1.getManualUpdateFragment)(user, instance, Object.assign({ nid: channel.nid }, log), `ecs-spatial:${cellKey}`);
}
function createEcsSpatialSnapshotBuffer(user, instance, channel) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    const needsProtocolPrelude = protocolWillChange(user, instance);
    instance.network.queueProtocolIfChanged(user);
    const queuedResponses = user.responseQueue.length;
    const plan = collectEcsSpatialSnapshotBase(user, instance, channel);
    const protocol = instance.network.getProtocol();
    const updateFragments = [];
    const visibleCellKeys = channel.getVisibleCellKeys(user.id);
    for (let i = 0; i < visibleCellKeys.length; i++) {
        const cellKey = visibleCellKeys[i];
        if (!channel.cellHasManualUpdates(cellKey)) {
            continue;
        }
        const fragment = getEcsSpatialCellUpdateFragment(user, instance, channel, cellKey);
        if (fragment && (fragment.updateProps > 0 || fragment.updateGroups > 0)) {
            updateFragments.push(fragment);
        }
    }
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const chunks = [];
    if (needsProtocolPrelude) {
        chunks.push((0, snapshotChunkBuilders_1.createProtocolPreludeChunk)(instance, protocol));
    }
    chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol), (0, SnapshotChunk_1.createSnapshotPlanChunk)('EcsSpatialSnapshotPlan', plan, instance.context, protocol));
    for (let i = 0; i < updateFragments.length; i++) {
        chunks.push((0, snapshotChunkBuilders_1.createPayloadCopyChunk)('EcsSpatialUpdateFragment', instance, updateFragments[i].payload, updateFragments[i].bytes));
    }
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer, {
        debug: instance.network.debugBinaryWrites,
        createWriter: byteLength => user.networkAdapter.binary.createWriter(byteLength)
    });
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, plan);
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        if (updateFragments.length > 0) {
            instance.network.recordSharedSnapshot();
        }
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.ecsCreateEntities.length + plan.ecsCreateComponents.length,
            updateProps: updateFragments.reduce((total, fragment) => total + fragment.updateProps, 0),
            updateGroups: updateFragments.reduce((total, fragment) => total + fragment.updateGroups, 0),
            groupedUpdateProps: updateFragments.reduce((total, fragment) => total + fragment.groupedUpdateProps, 0),
            deletes: plan.ecsDeleteEntities.length + plan.deleteEntities.length,
            messages: (0, snapshotPlanStats_1.countPlanMessages)(plan),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        });
    }
    return writer.payload;
}
function getManualUpdateChannelFragment(user, instance, channel) {
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:manual:${protocol.nidType}:${protocol.ntypeType}`;
    const cached = instance.network.sharedUpdateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        countStart = performance.now();
    }
    const bytes = (0, manualUpdates_1.countManualUpdateBytes)(channel, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    (0, manualUpdates_1.writeManualUpdates)(channel, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: channel.manualPropNids.length,
        updateGroups: channel.manualGroupNids.length,
        groupedUpdateProps: (0, manualUpdates_1.countManualGroupedProps)(channel)
    };
    instance.network.sharedUpdateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes });
    return fragment;
}
function createSharedUpdateSnapshotBuffer(user, instance, channel) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    instance.network.queueProtocolIfChanged(user);
    const protocol = instance.network.getProtocol();
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user);
    user.lastVisibleCount = user.currentlyVisible.length;
    if (measure) {
        collectMs = performance.now() - collectStart;
    }
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    const scopedMessagePlan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    (0, channelMessages_1.addChannelMessages)(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites);
    const fragment = getSharedUpdateFragment(user, instance, channel);
    if (measure) {
        countStart = performance.now();
    }
    const chunks = [
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('Envelope', envelope, instance.context, protocol)
    ];
    const messageChunk = (0, snapshotChunkBuilders_1.createSharedMessageFragmentChunk)(instance, messageFragments);
    if (messageChunk) {
        chunks.push(messageChunk);
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push((0, SnapshotChunk_1.createSnapshotPlanChunk)('SharedUpdateMessages', scopedMessagePlan, instance.context, protocol));
    }
    chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
    chunks.push((0, snapshotChunkBuilders_1.createPayloadCopyChunk)('SharedUpdateFragment', instance, fragment.payload, fragment.bytes));
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer);
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, envelope);
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        instance.network.recordSharedSnapshot();
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: 0,
            updateProps: fragment.updateProps,
            updateGroups: fragment.updateGroups,
            groupedUpdateProps: fragment.groupedUpdateProps,
            deletes: 0,
            messages: (0, snapshotPlanStats_1.countPlanMessages)(envelope) + (0, snapshotPlanStats_1.countPlanMessages)(scopedMessagePlan) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        });
    }
    return writer.payload;
}
function createManualUpdateSnapshotBuffer(user, instance, channel) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    instance.network.queueProtocolIfChanged(user);
    const protocol = instance.network.getProtocol();
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user);
    user.lastVisibleCount = user.currentlyVisible.length;
    if (measure) {
        collectMs = performance.now() - collectStart;
    }
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    const scopedMessagePlan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    (0, channelMessages_1.addChannelMessages)(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites);
    const fragment = getManualUpdateChannelFragment(user, instance, channel);
    if (measure) {
        countStart = performance.now();
    }
    const chunks = [
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('Envelope', envelope, instance.context, protocol)
    ];
    const messageChunk = (0, snapshotChunkBuilders_1.createSharedMessageFragmentChunk)(instance, messageFragments);
    if (messageChunk) {
        chunks.push(messageChunk);
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push((0, SnapshotChunk_1.createSnapshotPlanChunk)('ManualUpdateMessages', scopedMessagePlan, instance.context, protocol));
    }
    chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
    chunks.push((0, snapshotChunkBuilders_1.createPayloadCopyChunk)('ManualUpdateFragment', instance, fragment.payload, fragment.bytes));
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer);
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, envelope);
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        instance.network.recordSharedSnapshot();
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: 0,
            updateProps: fragment.updateProps,
            updateGroups: fragment.updateGroups,
            groupedUpdateProps: fragment.groupedUpdateProps,
            deletes: 0,
            messages: (0, snapshotPlanStats_1.countPlanMessages)(envelope) + (0, snapshotPlanStats_1.countPlanMessages)(scopedMessagePlan) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        });
    }
    return writer.payload;
}
function createSharedDeltaSnapshotBuffer(user, instance, channel) {
    var _a;
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    instance.network.queueProtocolIfChanged(user);
    const protocol = instance.network.getProtocol();
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user);
    const entityDeltaFragments = getEntityDeltaFragments(user, instance, channel);
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    const scopedMessagePlan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    (0, channelMessages_1.addChannelMessages)(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites);
    const updateFragment = getSharedUpdateFragment(user, instance, channel, (_a = entityDeltaFragments.creates) === null || _a === void 0 ? void 0 : _a.nids);
    if (entityDeltaFragments.creates) {
        for (const nid of entityDeltaFragments.creates.nids) {
            envelope.channelEntityCreates.push({ nid, channelId: channel.nid });
        }
    }
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const chunks = [
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('Envelope', envelope, instance.context, protocol)
    ];
    const entityDeltaFragmentBytes = countEntityDeltaFragmentBytes(entityDeltaFragments);
    if (entityDeltaFragmentBytes > 0) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push((0, SnapshotChunk_1.createSnapshotChunk)('EntityDeltaFragments', entityDeltaFragmentBytes, writer => {
            writeEntityDeltaFragments(writer, instance, entityDeltaFragments);
        }));
    }
    const messageChunk = (0, snapshotChunkBuilders_1.createSharedMessageFragmentChunk)(instance, messageFragments);
    if (messageChunk) {
        chunks.push(messageChunk);
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push((0, SnapshotChunk_1.createSnapshotPlanChunk)('SharedDeltaMessages', scopedMessagePlan, instance.context, protocol));
    }
    chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
    chunks.push((0, snapshotChunkBuilders_1.createPayloadCopyChunk)('SharedDeltaUpdateFragment', instance, updateFragment.payload, updateFragment.bytes));
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer);
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    applySharedChannelDeltasToUser(user, channel, instance.tick, entityDeltaFragments);
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, envelope);
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: countEntityDeltaFragmentCreates(entityDeltaFragments),
            updateProps: updateFragment.updateProps,
            updateGroups: updateFragment.updateGroups,
            groupedUpdateProps: updateFragment.groupedUpdateProps,
            deletes: countEntityDeltaFragmentDeletes(entityDeltaFragments),
            messages: (0, snapshotPlanStats_1.countPlanMessages)(envelope) + (0, snapshotPlanStats_1.countPlanMessages)(scopedMessagePlan) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        });
    }
    return writer.payload;
}
function removeCreateNidsFromPlan(plan, nids) {
    plan.createEntities = plan.createEntities.filter(entity => !nids.has(entity.nid));
}
function removeDeleteNidsFromPlan(plan, nids) {
    plan.deleteEntities = plan.deleteEntities.filter(nid => !nids.has(nid));
}
function removeUpdateNidsFromPlan(plan, nids) {
    plan.updateEntities = plan.updateEntities.filter(update => !nids.has(update.nid));
    plan.updateEntityGroups = plan.updateEntityGroups.filter(update => !nids.has(update.nid));
}
function allRootsWerePreviouslyHidden(channel, cellKey, beforeVisible) {
    const roots = channel.getCellEntityNids(cellKey);
    for (let i = 0; i < roots.length; i++) {
        if (beforeVisible.has(roots[i])) {
            return false;
        }
    }
    return roots.length > 0;
}
function allNidsArePlannedDeletes(nids, plannedDeletes) {
    if (nids.length === 0) {
        return false;
    }
    for (let i = 0; i < nids.length; i++) {
        if (!plannedDeletes.has(nids[i])) {
            return false;
        }
    }
    return true;
}
function getManualStableVisibleCellKeys(channel, userId) {
    if (channel.hasStructuralDeltas()) {
        return null;
    }
    const rememberedKeys = channel.getRememberedCellKeys(userId);
    if (rememberedKeys.length === 0) {
        return null;
    }
    const currentKeys = channel.getVisibleCellKeys(userId);
    if (currentKeys.length > channel.stableFragmentCellLimit || currentKeys.length !== rememberedKeys.length) {
        return null;
    }
    const remembered = new Set(rememberedKeys);
    for (let i = 0; i < currentKeys.length; i++) {
        if (!remembered.has(currentKeys[i])) {
            return null;
        }
    }
    return currentKeys;
}
function getMovementStableVisibleCellKeys(channel, userId) {
    if (channel.hasStructuralDeltas()) {
        return null;
    }
    const rememberedKeys = channel.getRememberedCellKeys(userId);
    if (rememberedKeys.length === 0) {
        return null;
    }
    const currentKeys = channel.getVisibleCellKeys(userId);
    if (currentKeys.length > channel.stableFragmentCellLimit || currentKeys.length !== rememberedKeys.length) {
        return null;
    }
    const visible = new Set(currentKeys);
    for (let i = 0; i < rememberedKeys.length; i++) {
        if (!visible.has(rememberedKeys[i])) {
            return null;
        }
    }
    const moves = channel.getMovedRoots();
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        if (visible.has(move.fromCell) !== visible.has(move.toCell)) {
            return null;
        }
    }
    return currentKeys;
}
function addManualSpatialCreates(instance, plan, roots, seen) {
    const collected = collectCreateEntitiesForRoots(instance, roots);
    for (let i = 0; i < collected.createEntities.length; i++) {
        const entity = collected.createEntities[i];
        if (seen.has(entity.nid)) {
            continue;
        }
        seen.add(entity.nid);
        plan.createEntities.push(entity);
    }
}
function addManualSpatialDeletes(instance, plan, rootNid, seen) {
    instance.localState.collectEntityTreeDeletes(rootNid, plan.deleteEntities);
    for (let i = plan.deleteEntities.length - 1; i >= 0; i--) {
        const nid = plan.deleteEntities[i];
        if (seen.has(nid)) {
            plan.deleteEntities.splice(i, 1);
            continue;
        }
        seen.add(nid);
    }
}
function applyManualSpatialVisibilityDeltas(user, plan, tick) {
    for (let i = 0; i < plan.deleteEntities.length; i++) {
        const nid = plan.deleteEntities[i];
        user.tickLastSeen.delete(nid);
        const index = user.currentlyVisible.indexOf(nid);
        if (index > -1) {
            user.currentlyVisible.splice(index, 1);
        }
    }
    for (let i = 0; i < plan.createEntities.length; i++) {
        const nid = plan.createEntities[i].nid;
        if (!user.tickLastSeen.has(nid)) {
            user.currentlyVisible.push(nid);
        }
        user.tickLastSeen.set(nid, tick);
    }
    user.lastVisibleCount = user.currentlyVisible.length;
}
function createManualStableSpatialCellSnapshotBuffer(user, instance, channel, currentCellKeys) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    instance.network.queueProtocolIfChanged(user);
    const protocol = instance.network.getProtocol();
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user);
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    const visibleCellSet = new Set(currentCellKeys);
    const createNids = new Set();
    const deleteNids = new Set();
    const moves = channel.getMovedRoots();
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const fromVisible = visibleCellSet.has(move.fromCell);
        const toVisible = visibleCellSet.has(move.toCell);
        if (!fromVisible && toVisible) {
            addManualSpatialCreates(instance, plan, [move.entity], createNids);
        }
        else if (fromVisible && !toVisible) {
            addManualSpatialDeletes(instance, plan, move.entity.nid, deleteNids);
        }
    }
    if (plan.createEntities.length > 0) {
        for (let i = 0; i < plan.createEntities.length; i++) {
            envelope.channelEntityCreates.push({
                nid: plan.createEntities[i].nid,
                channelId: channel.nid
            });
        }
    }
    (0, channelMessages_1.addChannelMessages)(plan, user, channel, instance.network.debugBinaryWrites);
    const updateFragments = [];
    for (let i = 0; i < currentCellKeys.length; i++) {
        const cellKey = currentCellKeys[i];
        if (!channel.cellHasManualUpdates(cellKey)) {
            continue;
        }
        const fragment = getManualSpatialCellUpdateFragment(user, instance, channel, cellKey, false);
        if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
            updateFragments.push(fragment);
        }
    }
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const chunks = [
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('Envelope', envelope, instance.context, protocol),
        (0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol),
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('ManualSpatialMovementPlan', plan, instance.context, protocol)
    ];
    const messageChunk = (0, snapshotChunkBuilders_1.createSharedMessageFragmentChunk)(instance, messageFragments);
    if (messageChunk) {
        chunks.push(messageChunk);
    }
    const updateChunk = (0, snapshotChunkBuilders_1.createCellFragmentChunk)('ManualSpatialUpdateFragments', instance, updateFragments);
    if (updateChunk) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push(updateChunk);
    }
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer);
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    applyManualSpatialVisibilityDeltas(user, plan, instance.tick);
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, envelope);
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        instance.network.recordSharedSnapshot();
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.createEntities.length,
            updateProps: (0, cellEntityFragments_1.sumCellFragmentUpdateProps)(updateFragments),
            updateGroups: (0, cellEntityFragments_1.sumCellFragmentUpdateGroups)(updateFragments),
            groupedUpdateProps: (0, cellEntityFragments_1.sumCellFragmentGroupedProps)(updateFragments),
            deletes: plan.deleteEntities.length,
            messages: (0, snapshotPlanStats_1.countPlanMessages)(envelope) + (0, snapshotPlanStats_1.countPlanMessages)(plan) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        });
    }
    return writer.payload;
}
function createStableCellFragmentSnapshotBuffer(user, instance, channel, currentCellKeys) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    instance.network.queueProtocolIfChanged(user);
    const protocol = instance.network.getProtocol();
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user);
    const scopedMessagePlan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    (0, channelMessages_1.addChannelMessages)(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites);
    const updateFragments = [];
    for (let i = 0; i < currentCellKeys.length; i++) {
        if (!cellMayHaveUpdates(channel, currentCellKeys[i])) {
            continue;
        }
        const fragment = getCellUpdateFragment(user, instance, channel, currentCellKeys[i], false);
        if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
            updateFragments.push(fragment);
        }
    }
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const chunks = [
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('Envelope', envelope, instance.context, protocol)
    ];
    const messageChunk = (0, snapshotChunkBuilders_1.createSharedMessageFragmentChunk)(instance, messageFragments);
    if (messageChunk) {
        chunks.push(messageChunk);
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push((0, SnapshotChunk_1.createSnapshotPlanChunk)('StableCellMessages', scopedMessagePlan, instance.context, protocol));
    }
    const updateChunk = (0, snapshotChunkBuilders_1.createCellFragmentChunk)('StableCellUpdateFragments', instance, updateFragments);
    if (updateChunk) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push(updateChunk);
    }
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer);
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    user.lastVisibleCount = user.currentlyVisible.length;
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, envelope);
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length);
    if (measure) {
        commitMs = performance.now() - commitStart;
        instance.network.recordSharedSnapshot();
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: 0,
            updateProps: (0, cellEntityFragments_1.sumCellFragmentUpdateProps)(updateFragments),
            updateGroups: (0, cellEntityFragments_1.sumCellFragmentUpdateGroups)(updateFragments),
            groupedUpdateProps: (0, cellEntityFragments_1.sumCellFragmentGroupedProps)(updateFragments),
            deletes: 0,
            messages: (0, snapshotPlanStats_1.countPlanMessages)(envelope) + (0, snapshotPlanStats_1.countPlanMessages)(scopedMessagePlan) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        });
    }
    return writer.payload;
}
function createCellFragmentSnapshotBuffer(user, instance, channel) {
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    if ((0, channelModes_1.isManualSpatialCellFragmentChannel)(channel)) {
        const manualStableCellKeys = getManualStableVisibleCellKeys(channel, user.id);
        if (manualStableCellKeys) {
            return createManualStableSpatialCellSnapshotBuffer(user, instance, channel, manualStableCellKeys);
        }
    }
    const movementStableCellKeys = getMovementStableVisibleCellKeys(channel, user.id);
    if (movementStableCellKeys) {
        return createStableCellFragmentSnapshotBuffer(user, instance, channel, movementStableCellKeys);
    }
    const stableCellKeys = channel.getStableVisibleCellKeys(user.id);
    if (stableCellKeys && stableCellKeys.length <= channel.stableFragmentCellLimit) {
        return createStableCellFragmentSnapshotBuffer(user, instance, channel, stableCellKeys);
    }
    instance.network.queueProtocolIfChanged(user);
    const queuedResponses = user.responseQueue.length;
    const previousCellKeys = channel.getRememberedCellKeys(user.id);
    const previousCellKeySet = new Set(previousCellKeys);
    const beforeVisible = new Set(user.currentlyVisible);
    const plan = (0, channelModes_1.isManualSpatialCellFragmentChannel)(channel)
        ? collectManualSpatialVisibilityPlan(user, instance, channel)
        : (0, collectSnapshotPlan_1.collectSnapshotPlan)(user, instance);
    if (!(0, channelModes_1.isManualSpatialCellFragmentChannel)(channel)) {
        (0, channelMessages_1.addChannelMessages)(plan, user, channel, instance.network.debugBinaryWrites);
    }
    const currentCellKeys = channel.getVisibleCellKeys(user.id);
    const currentCellKeySet = new Set(currentCellKeys);
    const protocol = instance.network.getProtocol();
    const createFragments = [];
    const deleteFragments = [];
    const updateFragments = [];
    const plannedDeletes = new Set(plan.deleteEntities);
    for (let i = 0; i < currentCellKeys.length; i++) {
        const cellKey = currentCellKeys[i];
        if (previousCellKeySet.has(cellKey)) {
            if (!cellMayHaveUpdates(channel, cellKey)) {
                continue;
            }
            const fragment = getCellUpdateFragment(user, instance, channel, cellKey);
            if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                updateFragments.push(fragment);
                removeUpdateNidsFromPlan(plan, fragment.nids);
            }
            continue;
        }
        if (allRootsWerePreviouslyHidden(channel, cellKey, beforeVisible)) {
            const fragment = getCellCreateFragment(user, instance, channel, cellKey);
            if (fragment.creates > 0) {
                createFragments.push(fragment);
                removeCreateNidsFromPlan(plan, fragment.nids);
            }
        }
        else if ((0, channelModes_1.isManualSpatialCellFragmentChannel)(channel) && channel.cellHasManualUpdates(cellKey)) {
            const fragment = getManualSpatialCellUpdateFragment(user, instance, channel, cellKey);
            if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                updateFragments.push(fragment);
            }
        }
    }
    for (let i = 0; i < previousCellKeys.length; i++) {
        const cellKey = previousCellKeys[i];
        if (currentCellKeySet.has(cellKey)) {
            continue;
        }
        const nids = channel.getRememberedCellNids(user.id, cellKey);
        if (allNidsArePlannedDeletes(nids, plannedDeletes)) {
            const fragment = getCellDeleteFragment(user, instance, channel, cellKey, nids);
            if (fragment.deletes > 0) {
                deleteFragments.push(fragment);
                removeDeleteNidsFromPlan(plan, fragment.nids);
            }
        }
    }
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    if (measure) {
        collectMs = performance.now() - collectStart;
        countStart = performance.now();
    }
    const chunks = [
        (0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol),
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('CellFragmentSnapshotPlan', plan, instance.context, protocol)
    ];
    const createChunk = (0, snapshotChunkBuilders_1.createCellFragmentChunk)('CellCreateFragments', instance, createFragments);
    if (createChunk) {
        chunks.push(createChunk);
    }
    const deleteChunk = (0, snapshotChunkBuilders_1.createCellFragmentChunk)('CellDeleteFragments', instance, deleteFragments);
    if (deleteChunk) {
        chunks.push(deleteChunk);
    }
    const messageChunk = (0, snapshotChunkBuilders_1.createSharedMessageFragmentChunk)(instance, messageFragments);
    if (messageChunk) {
        chunks.push(messageChunk);
    }
    const updateChunk = (0, snapshotChunkBuilders_1.createCellFragmentChunk)('CellUpdateFragments', instance, updateFragments);
    if (updateChunk) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channel.nid, protocol));
        chunks.push(updateChunk);
    }
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer, {
        debug: instance.network.debugBinaryWrites,
        createWriter: byteLength => user.networkAdapter.binary.createWriter(byteLength)
    });
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, plan);
    applyCellEntityFragmentsToUser(user, instance.tick, createFragments, deleteFragments);
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length);
    channel.rememberVisibleCells(user.id);
    if (measure) {
        commitMs = performance.now() - commitStart;
        instance.network.recordSharedSnapshot();
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.createEntities.length + (0, cellEntityFragments_1.sumCellFragmentCreates)(createFragments),
            updateProps: plan.updateEntities.length + (0, cellEntityFragments_1.sumCellFragmentUpdateProps)(updateFragments),
            updateGroups: plan.updateEntityGroups.length + (0, cellEntityFragments_1.sumCellFragmentUpdateGroups)(updateFragments),
            groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0) +
                (0, cellEntityFragments_1.sumCellFragmentGroupedProps)(updateFragments),
            deletes: plan.deleteEntities.length + (0, cellEntityFragments_1.sumCellFragmentDeletes)(deleteFragments),
            messages: (0, snapshotPlanStats_1.countPlanMessages)(plan) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        });
    }
    return writer.payload;
}
const createSnapshotBuffer = (user, instance) => {
    const hasPendingLifecycleWork = user.hasPendingVisibilityDeletes() ||
        user.hasPendingChannelOpens() ||
        user.hasPendingChannelCloses();
    const ecsSpatialChannel = (0, channelModes_1.getSingleEcsSpatialSnapshotChannel)(user);
    const ecsChannel = (0, channelModes_1.getSingleEcsSnapshotChannel)(user);
    const manualUpdateChannel = (0, channelModes_1.getSingleManualUpdateChannel)(user);
    const sharedChannel = (0, channelModes_1.getSingleSharedChannel)(user);
    const cellFragmentChannel = (0, channelModes_1.getSingleCellFragmentChannel)(user);
    if (!hasPendingLifecycleWork && ecsSpatialChannel && !channelHasHeaderPending(user, ecsSpatialChannel)) {
        return user.withChannelVisibilityState(ecsSpatialChannel.nid, () => createEcsSpatialSnapshotBuffer(user, instance, ecsSpatialChannel));
    }
    if (!hasPendingLifecycleWork && ecsChannel && !channelHasHeaderPending(user, ecsChannel)) {
        return user.withChannelVisibilityState(ecsChannel.nid, () => createEcsSnapshotBuffer(user, instance, ecsChannel));
    }
    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        sharedChannel &&
        !channelHasHeaderPending(user, sharedChannel) &&
        hasChannelDeltas(sharedChannel) &&
        user.withChannelVisibilityState(sharedChannel.nid, () => canUseSharedDeltaFragments(user, sharedChannel))) {
        return user.withChannelVisibilityState(sharedChannel.nid, () => createSharedDeltaSnapshotBuffer(user, instance, sharedChannel));
    }
    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        manualUpdateChannel &&
        !channelHasHeaderPending(user, manualUpdateChannel) &&
        user.withChannelVisibilityState(manualUpdateChannel.nid, () => canUseSharedUpdateFragment(user, manualUpdateChannel))) {
        return user.withChannelVisibilityState(manualUpdateChannel.nid, () => createManualUpdateSnapshotBuffer(user, instance, manualUpdateChannel));
    }
    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        sharedChannel &&
        !channelHasHeaderPending(user, sharedChannel) &&
        user.withChannelVisibilityState(sharedChannel.nid, () => canUseSharedUpdateFragment(user, sharedChannel))) {
        return user.withChannelVisibilityState(sharedChannel.nid, () => createSharedUpdateSnapshotBuffer(user, instance, sharedChannel));
    }
    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        cellFragmentChannel &&
        !channelHasHeaderPending(user, cellFragmentChannel) &&
        canUseCellFragments(cellFragmentChannel, user.id)) {
        return user.withChannelVisibilityState(cellFragmentChannel.nid, () => createCellFragmentSnapshotBuffer(user, instance, cellFragmentChannel));
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let collectStart = 0;
    let collectMs = 0;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    let commitStart = 0;
    let commitMs = 0;
    if (measure) {
        collectStart = performance.now();
    }
    instance.network.queueProtocolIfChanged(user);
    const protocol = instance.network.getProtocol();
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user);
    const channelPlans = [];
    const pendingDeletePlan = collectPendingVisibilityDeletePlan(user);
    // Multi-channel users receive an appended stream per subscribed channel.
    // Do not reintroduce a global visibility union here; channel-specific state
    // is what preserves manual/spatial/ECS fast paths and client identities.
    for (const channel of user.subscriptions.values()) {
        const channelPlan = collectSubscribedChannelSnapshotPlan(user, instance, channel);
        if (hasSnapshotPlanContent(channelPlan)) {
            channelPlans.push({ channelId: channel.nid, plan: channelPlan });
        }
    }
    if (measure) {
        collectMs = performance.now() - collectStart;
    }
    const messageFragments = (0, messageFragments_1.getSharedMessageFragments)(user, instance);
    if (measure) {
        countStart = performance.now();
    }
    // The writer uses exact-sized buffers, so normal snapshot creation does a
    // count pass followed by a write pass. The metrics split these deliberately:
    // if count and write both scale with update volume, prop bundles or cached
    // binary fragments are better candidates than generic micro-optimizations.
    const chunks = [
        (0, SnapshotChunk_1.createSnapshotPlanChunk)('Envelope', envelope, instance.context, protocol)
    ];
    if (pendingDeletePlan) {
        chunks.push((0, SnapshotChunk_1.createSnapshotPlanChunk)('PendingVisibilityDeletes', pendingDeletePlan, instance.context, protocol));
    }
    for (let i = 0; i < channelPlans.length; i++) {
        chunks.push((0, snapshotChunkBuilders_1.createChannelScopeChunk)(channelPlans[i].channelId, protocol));
        chunks.push((0, SnapshotChunk_1.createSnapshotPlanChunk)('ChannelSnapshotPlan', channelPlans[i].plan, instance.context, protocol));
    }
    const messageFragmentBytes = (0, messageFragments_1.sumSharedMessageFragmentBytes)(messageFragments, protocol);
    if (messageFragmentBytes > 0) {
        chunks.push((0, SnapshotChunk_1.createSnapshotChunk)('MessageFragments', messageFragmentBytes, writer => {
            (0, messageFragments_1.writeSharedMessageFragments)(writer, instance, messageFragments);
        }));
    }
    const bytes = (0, SnapshotChunk_1.sumSnapshotChunkBytes)(chunks);
    const writer = user.networkAdapter.binary.createWriter(bytes);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    (0, SnapshotChunk_1.writeSnapshotChunks)(chunks, writer, {
        debug: instance.network.debugBinaryWrites,
        createWriter: byteLength => user.networkAdapter.binary.createWriter(byteLength)
    });
    if (measure) {
        writeMs = performance.now() - writeStart;
        commitStart = performance.now();
    }
    (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, envelope);
    if (pendingDeletePlan) {
        (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, pendingDeletePlan);
    }
    for (let i = 0; i < channelPlans.length; i++) {
        (0, commitSnapshotPlan_1.commitSnapshotPlan)(user, channelPlans[i].plan);
    }
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length);
    rememberCellFragmentChannelVisibility(user);
    if (sharedChannel) {
        user.withChannelVisibilityState(sharedChannel.nid, () => rememberSharedChannelVersion(user));
    }
    if (measure) {
        commitMs = performance.now() - commitStart;
        // These counts come from the already-built plan so the instrumentation
        // does not walk entity schemas or visibility a second time.
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: (0, snapshotPlanStats_1.sumPlanCreates)(channelPlans),
            updateProps: (0, snapshotPlanStats_1.sumPlanUpdateProps)(channelPlans),
            updateGroups: (0, snapshotPlanStats_1.sumPlanUpdateGroups)(channelPlans),
            groupedUpdateProps: (0, snapshotPlanStats_1.sumPlanGroupedUpdateProps)(channelPlans),
            deletes: (0, snapshotPlanStats_1.sumPlanDeletes)(channelPlans),
            messages: (0, snapshotPlanStats_1.countPlanMessages)(envelope) + (0, snapshotPlanStats_1.sumPlanMessages)(channelPlans) + (0, messageFragments_1.sumSharedMessageFragmentMessages)(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        });
    }
    return writer.payload;
};
exports.default = createSnapshotBuffer;
