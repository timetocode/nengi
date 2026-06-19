"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCellEntityFragmentsToUser = applyCellEntityFragmentsToUser;
exports.getCellCreateFragment = getCellCreateFragment;
exports.getCellDeleteFragment = getCellDeleteFragment;
exports.getManualSpatialCellUpdateFragment = getManualSpatialCellUpdateFragment;
exports.getCellUpdateFragment = getCellUpdateFragment;
exports.cellMayHaveUpdates = cellMayHaveUpdates;
const countSnapshotBytes_1 = require("./countSnapshotBytes");
const writeSnapshot_1 = require("./writeSnapshot");
const SnapshotPlan_1 = require("./SnapshotPlan");
const channelModes_1 = require("./channelModes");
const entitySnapshotPlans_1 = require("./entitySnapshotPlans");
const manualUpdates_1 = require("./manualUpdates");
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
            user.markVisible(nid, tick, [], []);
        }
    }
    user.lastVisibleCount = user.currentlyVisible.length;
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
    const collected = (0, entitySnapshotPlans_1.collectCreateEntitiesForRoots)(instance, channel.getCellEntities(cellKey));
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
        nids: includeNids ? (0, entitySnapshotPlans_1.collectNidsForRoots)(instance, channel.getCellEntities(cellKey)) : new Set(),
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
    const plan = (0, entitySnapshotPlans_1.collectSpatialCellUpdatePlan)(instance, channel, cellKey);
    const nids = includeNids ? (0, entitySnapshotPlans_1.collectNidsForRoots)(instance, channel.getCellEntities(cellKey)) : new Set();
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
