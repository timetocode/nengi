"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPayloadCopyChunk = createPayloadCopyChunk;
exports.createChannelScopeChunk = createChannelScopeChunk;
exports.createSharedMessageFragmentChunk = createSharedMessageFragmentChunk;
exports.createProtocolPreludeChunk = createProtocolPreludeChunk;
exports.createCellFragmentChunk = createCellFragmentChunk;
const Protocol_1 = require("../../common/binary/Protocol");
const SnapshotPlan_1 = require("./SnapshotPlan");
const SnapshotChunk_1 = require("./SnapshotChunk");
const writeSnapshot_1 = require("./writeSnapshot");
const snapshotPayload_1 = require("./snapshotPayload");
const messageFragments_1 = require("./messageFragments");
const cellEntityFragments_1 = require("./cellEntityFragments");
function createPayloadCopyChunk(label, instance, payload, bytes) {
    return (0, SnapshotChunk_1.createSnapshotChunk)(label, bytes, writer => {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0;
        (0, snapshotPayload_1.writePayload)(writer, payload);
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, bytes);
        }
    });
}
function createChannelScopeChunk(channelId, protocol) {
    return (0, SnapshotChunk_1.createSnapshotChunk)('ChannelScope', 1 + (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType), writer => {
        (0, writeSnapshot_1.writeChannelScope)(channelId, writer, protocol);
    });
}
function createSharedMessageFragmentChunk(instance, messageFragments) {
    const protocol = instance.network.getProtocol();
    const bytes = (0, messageFragments_1.sumSharedMessageFragmentBytes)(messageFragments, protocol);
    if (bytes === 0) {
        return null;
    }
    return (0, SnapshotChunk_1.createSnapshotChunk)('MessageFragments', bytes, writer => {
        (0, messageFragments_1.writeSharedMessageFragments)(writer, instance, messageFragments);
    });
}
function createProtocolPreludeChunk(instance, protocol) {
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.engineMessages = [instance.network.createProtocolEngineMessage()];
    return (0, SnapshotChunk_1.createSnapshotPlanChunk)('ProtocolPrelude', plan, instance.context, protocol);
}
function createCellFragmentChunk(label, instance, fragments) {
    const bytes = (0, cellEntityFragments_1.sumCellFragmentBytes)(fragments);
    if (bytes === 0) {
        return null;
    }
    return (0, SnapshotChunk_1.createSnapshotChunk)(label, bytes, writer => {
        (0, cellEntityFragments_1.writeCellFragments)(writer, instance, fragments);
    });
}
