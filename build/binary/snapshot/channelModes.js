"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSharedUpdateChannel = isSharedUpdateChannel;
exports.isSharedMessageChannel = isSharedMessageChannel;
exports.isManualUpdateChannel = isManualUpdateChannel;
exports.isEcsSnapshotChannel = isEcsSnapshotChannel;
exports.getSingleEcsSnapshotChannel = getSingleEcsSnapshotChannel;
exports.isEcsSpatialSnapshotChannel = isEcsSpatialSnapshotChannel;
exports.getSingleEcsSpatialSnapshotChannel = getSingleEcsSpatialSnapshotChannel;
exports.getEcsSnapshotChannels = getEcsSnapshotChannels;
exports.isCellFragmentChannel = isCellFragmentChannel;
exports.isManualSpatialCellFragmentChannel = isManualSpatialCellFragmentChannel;
exports.getSingleSharedChannel = getSingleSharedChannel;
exports.getSingleManualUpdateChannel = getSingleManualUpdateChannel;
exports.getSingleCellFragmentChannel = getSingleCellFragmentChannel;
function isSharedUpdateChannel(channel) {
    var _a;
    return Array.isArray(channel.entityNids) &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.deltaBaseVersion === 'number' &&
        Array.isArray(channel.createdRoots) &&
        Array.isArray(channel.deletedNids) &&
        ((_a = channel.entities) === null || _a === void 0 ? void 0 : _a.array);
}
function isSharedMessageChannel(channel) {
    return Array.isArray(channel.broadcastMessages);
}
function isManualUpdateChannel(channel) {
    const candidate = channel;
    return isSharedUpdateChannel(channel) &&
        (candidate === null || candidate === void 0 ? void 0 : candidate.manualUpdateChannelMode) === true &&
        Array.isArray(candidate.manualPropNids) &&
        Array.isArray(candidate.manualPropSchemas) &&
        Array.isArray(candidate.manualPropValues) &&
        Array.isArray(candidate.manualGroupNids) &&
        Array.isArray(candidate.manualGroupSchemas) &&
        Array.isArray(candidate.manualGroupValueOffsets) &&
        Array.isArray(candidate.manualGroupValues);
}
function isEcsSnapshotChannel(channel) {
    const candidate = channel;
    return (candidate === null || candidate === void 0 ? void 0 : candidate.ecsChannelMode) === true &&
        Array.isArray(candidate.manualPropNids) &&
        Array.isArray(candidate.manualPropSchemas) &&
        Array.isArray(candidate.manualPropValues) &&
        Array.isArray(candidate.manualGroupNids) &&
        Array.isArray(candidate.manualGroupSchemas) &&
        Array.isArray(candidate.manualGroupValueOffsets) &&
        Array.isArray(candidate.manualGroupValues) &&
        typeof candidate.getVisibleNetworkedNids === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function' &&
        typeof candidate.isRootNid === 'function' &&
        typeof candidate.isComponentNid === 'function' &&
        typeof candidate.isRootDeletedComponentNid === 'function' &&
        typeof candidate.getComponent === 'function';
}
function getSingleEcsSnapshotChannel(user) {
    if (user.subscriptions.size !== 1) {
        return null;
    }
    const channel = user.subscriptions.values().next().value;
    return isEcsSnapshotChannel(channel) ? channel : null;
}
function isEcsSpatialSnapshotChannel(channel) {
    const candidate = channel;
    return isEcsSnapshotChannel(channel) &&
        (candidate === null || candidate === void 0 ? void 0 : candidate.ecsSpatialChannelMode) === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getVisibleCellKeys === 'function' &&
        typeof candidate.getManualCellUpdateLog === 'function' &&
        typeof candidate.cellHasManualUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasOnlyMovementDeltas === 'function' &&
        typeof candidate.isCellVisible === 'function' &&
        typeof candidate.getRootComponents === 'function';
}
function getSingleEcsSpatialSnapshotChannel(user) {
    if (user.subscriptions.size !== 1) {
        return null;
    }
    const channel = user.subscriptions.values().next().value;
    return isEcsSpatialSnapshotChannel(channel) ? channel : null;
}
function getEcsSnapshotChannels(user) {
    const channels = [];
    for (const channel of user.subscriptions.values()) {
        if (isEcsSnapshotChannel(channel)) {
            channels.push(channel);
        }
    }
    return channels;
}
function isCellFragmentChannel(channel) {
    return (channel === null || channel === void 0 ? void 0 : channel.cellFragmentMode) === true &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.fragmentCellLimit === 'number' &&
        typeof channel.stableFragmentCellLimit === 'number' &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.getCellEntities === 'function' &&
        typeof channel.getCellEntityNids === 'function' &&
        typeof channel.getCellVersion === 'function' &&
        typeof channel.getRememberedCellKeys === 'function' &&
        typeof channel.getRememberedCellNids === 'function' &&
        typeof channel.getStableVisibleCellKeys === 'function' &&
        typeof channel.rememberVisibleCells === 'function' &&
        typeof channel.getMovedRoots === 'function' &&
        typeof channel.hasStructuralDeltas === 'function';
}
function isManualSpatialCellFragmentChannel(channel) {
    const candidate = channel;
    return isCellFragmentChannel(channel) &&
        (candidate === null || candidate === void 0 ? void 0 : candidate.manualSpatialChannelMode) === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getManualCellUpdateLog === 'function' &&
        typeof candidate.cellHasManualUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function';
}
function getSingleSharedChannel(user) {
    if (user.subscriptions.size !== 1) {
        return null;
    }
    const channel = user.subscriptions.values().next().value;
    return isSharedUpdateChannel(channel) ? channel : null;
}
function getSingleManualUpdateChannel(user) {
    if (user.subscriptions.size !== 1) {
        return null;
    }
    const channel = user.subscriptions.values().next().value;
    return isManualUpdateChannel(channel) ? channel : null;
}
function getSingleCellFragmentChannel(user) {
    if (user.subscriptions.size !== 1) {
        return null;
    }
    const channel = user.subscriptions.values().next().value;
    return isCellFragmentChannel(channel) ? channel : null;
}
