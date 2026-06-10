"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = exports.UserConnectionState = void 0;
const Protocol_1 = require("../common/binary/Protocol");
var UserConnectionState;
(function (UserConnectionState) {
    UserConnectionState[UserConnectionState["NULL"] = 0] = "NULL";
    UserConnectionState[UserConnectionState["OpenPreHandshake"] = 1] = "OpenPreHandshake";
    UserConnectionState[UserConnectionState["OpenAwaitingHandshake"] = 2] = "OpenAwaitingHandshake";
    UserConnectionState[UserConnectionState["Open"] = 3] = "Open";
    UserConnectionState[UserConnectionState["Closed"] = 4] = "Closed"; // closed, network.send would crash if invoked
})(UserConnectionState || (exports.UserConnectionState = UserConnectionState = {}));
function createChannelVisibilityState() {
    return {
        tickLastSeen: new Map(),
        currentlyVisible: [],
        lastVisibleCount: 0
    };
}
class User {
    constructor(socket, networkAdapter) {
        this.id = 0;
        this.instance = null;
        this.network = null;
        this.remoteAddress = null;
        this.connectionState = UserConnectionState.NULL;
        this.subscriptions = new Map();
        this.engineMessageQueue = [];
        this.messageQueue = [];
        this.responseQueue = [];
        this.protocol = Object.assign({}, Protocol_1.DEFAULT_PROTOCOL);
        this.channelVisibilityStates = new Map();
        this.legacyVisibilityState = createChannelVisibilityState();
        this.pendingVisibilityDeletes = new Map();
        // Compatibility accessors for snapshot collectors that operate on one bound
        // channel state at a time. New code should use getChannelVisibilityState().
        this.tickLastSeen = new Map();
        this.currentlyVisible = [];
        this.sharedChannelVersions = new Map();
        this.stableVisibleRefs = new Map();
        this.knownChannelHeaderVersions = new Map();
        this.pendingChannelHeaderDeletes = new Set();
        this.lastSentInstanceTick = 0;
        this.lastReceivedClientTick = 0;
        this.nextPingId = 1;
        this.lastSentPingId = 0;
        this.latency = 0;
        this.lastSentPingTimestamp = 0;
        this.lastSentPingTimeMs = 0;
        this.recentLatencies = [];
        this.latencySamples = 3;
        this.roundTripMs = 0;
        this.oneWayMs = 0;
        this.minRoundTripMs = Number.POSITIVE_INFINITY;
        this.clockOffsetMs = 0;
        this.clockSyncSamples = 0;
        this.interpolationDelayMs = 0;
        this.lastInterpolationDelayTimeMs = 0;
        this.lastVisibleCount = 0;
        this.socket = socket;
        this.networkAdapter = networkAdapter;
        this.bindVisibilityState(this.legacyVisibilityState);
    }
    bindVisibilityState(state) {
        this.tickLastSeen = state.tickLastSeen;
        this.currentlyVisible = state.currentlyVisible;
        this.lastVisibleCount = state.lastVisibleCount;
    }
    syncBoundVisibilityState(state) {
        state.tickLastSeen = this.tickLastSeen;
        state.currentlyVisible = this.currentlyVisible;
        state.lastVisibleCount = this.lastVisibleCount;
    }
    // Visibility is tracked per channel, even though older collector helpers
    // still read this.currentlyVisible and this.tickLastSeen directly. Binding
    // one channel's state preserves those helpers while avoiding cross-channel
    // unioning or duplicate suppression in the production snapshot path.
    getChannelVisibilityState(channelId) {
        let state = this.channelVisibilityStates.get(channelId);
        if (!state) {
            state = createChannelVisibilityState();
            this.channelVisibilityStates.set(channelId, state);
        }
        return state;
    }
    deleteChannelVisibilityState(channelId) {
        this.channelVisibilityStates.delete(channelId);
        this.stableVisibleRefs.delete(channelId);
        this.sharedChannelVersions.delete(channelId);
    }
    hasPendingVisibilityDeletes() {
        return this.pendingVisibilityDeletes.size > 0;
    }
    consumePendingVisibilityDeletes() {
        const deletes = [];
        for (const nids of this.pendingVisibilityDeletes.values()) {
            for (let i = 0; i < nids.length; i++) {
                deletes.push(nids[i]);
            }
        }
        this.pendingVisibilityDeletes.clear();
        return deletes;
    }
    withChannelVisibilityState(channelId, fn) {
        const previous = {
            tickLastSeen: this.tickLastSeen,
            currentlyVisible: this.currentlyVisible,
            lastVisibleCount: this.lastVisibleCount
        };
        const state = this.getChannelVisibilityState(channelId);
        this.bindVisibilityState(state);
        try {
            const result = fn(state);
            this.syncBoundVisibilityState(state);
            return result;
        }
        finally {
            this.tickLastSeen = previous.tickLastSeen;
            this.currentlyVisible = previous.currentlyVisible;
            this.lastVisibleCount = previous.lastVisibleCount;
        }
    }
    calculateLatency() {
        const deltaMs = Date.now() - this.lastSentPingTimestamp;
        this.recentLatencies.push(deltaMs);
        if (this.recentLatencies.length > 0) {
            let curr = 0;
            for (let i = 0; i < this.recentLatencies.length; i++) {
                curr += this.recentLatencies[i];
            }
            this.latency = curr / this.recentLatencies.length;
        }
        while (this.recentLatencies.length > this.latencySamples) {
            this.recentLatencies.shift();
        }
    }
    nextPing() {
        const pingId = this.nextPingId;
        this.nextPingId++;
        if (this.nextPingId > 65535) {
            this.nextPingId = 1;
        }
        this.lastSentPingId = pingId;
        return pingId;
    }
    recordClockSyncPong(pong, serverReceiveTimeMs) {
        if (pong.pingId !== undefined && this.lastSentPingId !== 0 && pong.pingId !== this.lastSentPingId) {
            return false;
        }
        const serverSendTimeMs = pong.serverTimeMs;
        const clientReceiveTimeMs = pong.clientReceiveTimeMs;
        const clientSendTimeMs = pong.clientSendTimeMs;
        const clientTurnaroundMs = Math.max(0, clientSendTimeMs - clientReceiveTimeMs);
        const roundTripMs = Math.max(0, (serverReceiveTimeMs - serverSendTimeMs) - clientTurnaroundMs);
        const offsetMs = ((serverSendTimeMs - clientReceiveTimeMs) + (serverReceiveTimeMs - clientSendTimeMs)) * 0.5;
        this.recentLatencies.push(roundTripMs);
        while (this.recentLatencies.length > this.latencySamples) {
            this.recentLatencies.shift();
        }
        let total = 0;
        for (let i = 0; i < this.recentLatencies.length; i++) {
            total += this.recentLatencies[i];
        }
        this.roundTripMs = this.recentLatencies.length > 0 ? total / this.recentLatencies.length : roundTripMs;
        this.oneWayMs = this.roundTripMs * 0.5;
        this.latency = this.roundTripMs;
        this.minRoundTripMs = Math.min(this.minRoundTripMs, roundTripMs);
        if (this.clockSyncSamples === 0) {
            this.clockOffsetMs = offsetMs;
        }
        else {
            this.clockOffsetMs = (this.clockOffsetMs * 0.85) + (offsetMs * 0.15);
        }
        this.clockSyncSamples++;
        return true;
    }
    estimateCommandTiming(input, serverReceivedTimeMs) {
        const estimatedInputTimeMs = this.clockSyncSamples > 0
            ? input.clientTimeMs + this.clockOffsetMs
            : serverReceivedTimeMs - this.oneWayMs;
        const renderDelayMs = Number.isFinite(input.renderDelayMs) ? Math.max(0, input.renderDelayMs) : 0;
        return {
            commandIndex: input.commandIndex,
            clientTimeMs: input.clientTimeMs,
            renderDelayMs,
            viewTick: Number.isFinite(input.viewTick) ? input.viewTick : -1,
            viewServerTimeMs: Number.isFinite(input.viewServerTimeMs) ? input.viewServerTimeMs : -1,
            serverReceivedTimeMs,
            estimatedInputTimeMs,
            estimatedViewTimeMs: estimatedInputTimeMs - renderDelayMs,
            roundTripMs: this.roundTripMs,
            oneWayMs: this.oneWayMs,
            clockOffsetMs: this.clockOffsetMs,
            clockSyncSamples: this.clockSyncSamples
        };
    }
    recordInterpolationDelay(delayMs, serverReceivedTimeMs) {
        if (!Number.isFinite(delayMs)) {
            return false;
        }
        this.interpolationDelayMs = Math.max(0, Math.min(5000, delayMs));
        this.lastInterpolationDelayTimeMs = serverReceivedTimeMs;
        return true;
    }
    subscribe(channel) {
        this.subscriptions.set(channel.nid, channel);
    }
    unsubscribe(channel) {
        this.subscriptions.delete(channel.nid);
        const knownHeader = this.knownChannelHeaderVersions.has(channel.nid);
        if (knownHeader) {
            this.pendingChannelHeaderDeletes.add(channel.nid);
        }
        this.knownChannelHeaderVersions.delete(channel.nid);
        const state = this.channelVisibilityStates.get(channel.nid);
        if (!knownHeader && state && state.currentlyVisible.length > 0) {
            this.pendingVisibilityDeletes.set(channel.nid, state.currentlyVisible.slice());
        }
        this.deleteChannelVisibilityState(channel.nid);
    }
    queueEngineMessage(engineMessage) {
        this.engineMessageQueue.push(engineMessage);
    }
    queueMessage(message) {
        this.messageQueue.push(message);
    }
    hasPendingChannelHeaderDeletes() {
        return this.pendingChannelHeaderDeletes.size > 0;
    }
    consumePendingChannelHeaderDeletes() {
        const deletes = Array.from(this.pendingChannelHeaderDeletes);
        this.pendingChannelHeaderDeletes.clear();
        return deletes;
    }
    send(buffer) {
        this.networkAdapter.send(this, buffer);
    }
    disconnect(reason) {
        this.networkAdapter.disconnect(this, reason);
    }
    populateDeletions(tick, toDelete) {
        for (let i = this.currentlyVisible.length - 1; i >= 0; i--) {
            const nid = this.currentlyVisible[i];
            const lastSeenTick = this.tickLastSeen.get(nid);
            if (lastSeenTick !== tick) {
                toDelete.push(nid);
                this.tickLastSeen.delete(nid);
                this.currentlyVisible.splice(i, 1);
            }
        }
    }
    markVisible(nid, tick, toCreate, toUpdate, channel, channelEntityCreates) {
        var _a;
        const lastSeenTick = this.tickLastSeen.get(nid);
        if (lastSeenTick === tick) {
            return;
        }
        if (lastSeenTick === undefined) {
            toCreate.push(nid);
            if (channel && (channel.header || ((_a = channel.getHeader) === null || _a === void 0 ? void 0 : _a.call(channel)))) {
                channelEntityCreates.push({ nid, channelId: channel.nid });
            }
            this.currentlyVisible.push(nid);
        }
        else {
            toUpdate.push(nid);
        }
        this.tickLastSeen.set(nid, tick);
    }
    checkVisibility(tick) {
        const toCreate = [];
        const toUpdate = [];
        const toDelete = [];
        const channelEntityCreates = [];
        toDelete.push(...this.consumePendingVisibilityDeletes());
        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visible = this.checkChannelVisibility(channel, tick);
            for (let i = 0; i < visible.toCreate.length; i++) {
                toCreate.push(visible.toCreate[i]);
            }
            for (let i = 0; i < visible.toUpdate.length; i++) {
                toUpdate.push(visible.toUpdate[i]);
            }
            for (let i = 0; i < visible.toDelete.length; i++) {
                toDelete.push(visible.toDelete[i]);
            }
            for (let i = 0; i < visible.channelEntityCreates.length; i++) {
                channelEntityCreates.push(visible.channelEntityCreates[i]);
            }
        }
        return { toDelete, toUpdate, toCreate, channelEntityCreates };
    }
    checkChannelVisibility(channel, tick) {
        return this.withChannelVisibilityState(channel.nid, () => {
            var _a, _b;
            const toCreate = [];
            const toUpdate = [];
            const toDelete = [];
            const channelEntityCreates = [];
            const visibleNids = (_a = channel.getVisibleNetworkedNids) === null || _a === void 0 ? void 0 : _a.call(channel, this.id);
            if (visibleNids) {
                if (this.stableVisibleRefs.get(channel.nid) === visibleNids &&
                    this.currentlyVisible.length === visibleNids.length) {
                    for (let i = 0; i < visibleNids.length; i++) {
                        toUpdate.push(visibleNids[i]);
                    }
                    this.lastVisibleCount = this.currentlyVisible.length;
                    return { toDelete, toUpdate, toCreate, channelEntityCreates };
                }
                this.stableVisibleRefs.set(channel.nid, visibleNids);
                for (let i = 0; i < visibleNids.length; i++) {
                    this.markVisible(visibleNids[i], tick, toCreate, toUpdate, channel, channelEntityCreates);
                }
                this.populateDeletions(tick, toDelete);
                this.lastVisibleCount = this.currentlyVisible.length;
                return { toDelete, toUpdate, toCreate, channelEntityCreates };
            }
            const visibleRoots = ((_b = channel.getVisibleEntities) === null || _b === void 0 ? void 0 : _b.call(channel, this.id)) || [];
            for (let i = 0; i < visibleRoots.length; i++) {
                this.instance.localState.forEachEntityTree(visibleRoots[i], nid => {
                    this.markVisible(nid, tick, toCreate, toUpdate, channel, channelEntityCreates);
                });
            }
            this.populateDeletions(tick, toDelete);
            this.lastVisibleCount = this.currentlyVisible.length;
            return { toDelete, toUpdate, toCreate, channelEntityCreates };
        });
    }
}
exports.User = User;
