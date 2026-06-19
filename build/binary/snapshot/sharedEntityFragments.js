"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeEntityDeltaFragments = writeEntityDeltaFragments;
exports.countEntityDeltaFragmentBytes = countEntityDeltaFragmentBytes;
exports.countEntityDeltaFragmentCreates = countEntityDeltaFragmentCreates;
exports.countEntityDeltaFragmentDeletes = countEntityDeltaFragmentDeletes;
exports.applySharedChannelDeltasToUser = applySharedChannelDeltasToUser;
exports.canUseSharedDeltaFragments = canUseSharedDeltaFragments;
exports.getEntityDeltaFragments = getEntityDeltaFragments;
exports.getSharedUpdateFragment = getSharedUpdateFragment;
const countSnapshotBytes_1 = require("./countSnapshotBytes");
const entitySnapshotPlans_1 = require("./entitySnapshotPlans");
const snapshotPayload_1 = require("./snapshotPayload");
const SnapshotPlan_1 = require("./SnapshotPlan");
const writeSnapshot_1 = require("./writeSnapshot");
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
            user.markVisible(nid, tick, [], []);
        }
    }
    user.lastVisibleCount = user.currentlyVisible.length;
    user.sharedChannelVersions.set(channel.nid, channel.membershipVersion);
}
function canUseSharedDeltaFragments(user, channel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.deltaBaseVersion;
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
    const collected = (0, entitySnapshotPlans_1.collectCreateEntitiesForRoots)(instance, channel.createdRoots);
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
    const plan = (0, entitySnapshotPlans_1.collectChannelUpdatePlan)(instance, channel, excludedNids);
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
