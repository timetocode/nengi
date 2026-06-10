"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectBroadcastMessages = collectBroadcastMessages;
exports.getSharedMessageFragments = getSharedMessageFragments;
exports.sumSharedMessageFragmentBytes = sumSharedMessageFragmentBytes;
exports.sumSharedMessageFragmentMessages = sumSharedMessageFragmentMessages;
exports.writeSharedMessageFragments = writeSharedMessageFragments;
const SnapshotPlan_1 = require("./SnapshotPlan");
const countSnapshotBytes_1 = require("./countSnapshotBytes");
const writeSnapshot_1 = require("./writeSnapshot");
const channelModes_1 = require("./channelModes");
const snapshotPayload_1 = require("./snapshotPayload");
function collectBroadcastMessages(user) {
    const messages = [];
    user.subscriptions.forEach((channel) => {
        if ((0, channelModes_1.isSharedMessageChannel)(channel) && channel.broadcastMessages.length > 0) {
            for (let i = 0; i < channel.broadcastMessages.length; i++) {
                messages.push(channel.broadcastMessages[i]);
            }
        }
    });
    return messages;
}
function getSharedMessageFragment(user, instance, channel) {
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:${protocol.ntypeType}`;
    const cached = instance.network.sharedMessageFragments.get(key);
    if (cached) {
        instance.network.recordSharedMessageFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    const plan = (0, SnapshotPlan_1.createEmptySnapshotPlan)();
    plan.messages = channel.broadcastMessages;
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
        messages: channel.broadcastMessages.length
    };
    instance.network.sharedMessageFragments.set(key, fragment);
    instance.network.recordSharedMessageFragmentBuild({ countMs, writeMs, bytes, messages: fragment.messages });
    return fragment;
}
function getSharedMessageFragments(user, instance) {
    if (instance.network.debugBinaryWrites) {
        return [];
    }
    const fragments = [];
    user.subscriptions.forEach((channel) => {
        if ((0, channelModes_1.isSharedMessageChannel)(channel) && channel.broadcastMessages.length > 0) {
            fragments.push(getSharedMessageFragment(user, instance, channel));
        }
    });
    return fragments;
}
function sumSharedMessageFragmentBytes(fragments) {
    let bytes = 0;
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes;
    }
    return bytes;
}
function sumSharedMessageFragmentMessages(fragments) {
    let messages = 0;
    for (let i = 0; i < fragments.length; i++) {
        messages += fragments[i].messages;
    }
    return messages;
}
function writeSharedMessageFragments(writer, instance, fragments) {
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i];
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0;
        (0, snapshotPayload_1.writePayload)(writer, fragment.payload);
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedMessageFragmentCopy(performance.now() - copyStart, fragment.bytes);
        }
    }
}
