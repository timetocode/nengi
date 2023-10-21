"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = exports.UserConnectionState = void 0;
var UserConnectionState;
(function (UserConnectionState) {
    UserConnectionState[UserConnectionState["NULL"] = 0] = "NULL";
    UserConnectionState[UserConnectionState["OpenPreHandshake"] = 1] = "OpenPreHandshake";
    UserConnectionState[UserConnectionState["OpenAwaitingHandshake"] = 2] = "OpenAwaitingHandshake";
    UserConnectionState[UserConnectionState["Open"] = 3] = "Open";
    UserConnectionState[UserConnectionState["Closed"] = 4] = "Closed"; // closed, network.send would crash if invoked
})(UserConnectionState || (exports.UserConnectionState = UserConnectionState = {}));
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
        this.tickLastSeen = {};
        this.currentlyVisible = [];
        this.lastSentInstanceTick = 0;
        this.lastReceivedClientTick = 0;
        this.latency = 0;
        this.lastSentPingTimestamp = 0;
        this.recentLatencies = [];
        this.latencySamples = 3;
        this.socket = socket;
        this.networkAdapter = networkAdapter;
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
    subscribe(channel) {
        this.subscriptions.set(channel.nid, channel);
    }
    unsubscribe(channel) {
        this.subscriptions.delete(channel.nid);
    }
    queueEngineMessage(engineMessage) {
        this.engineMessageQueue.push(engineMessage);
    }
    queueMessage(message) {
        this.messageQueue.push(message);
    }
    send(buffer) {
        this.networkAdapter.send(this, buffer);
    }
    disconnect(reason) {
        this.networkAdapter.disconnect(this, reason);
    }
    populateDeletions(tick, toDelete) {
        for (let i = this.currentlyVisible.length - 1; i > -1; i--) {
            const nid = this.currentlyVisible[i];
            if (this.tickLastSeen[nid] !== tick) {
                toDelete.push(nid);
                delete this.tickLastSeen[nid]; //= 0
                this.currentlyVisible.splice(i, 1);
            }
        }
    }
    createOrUpdate(nid, tick, toCreate, toUpdate) {
        // was this entity visible last frame?
        if (!this.tickLastSeen[nid]) {
            // no? well then this user needs to create it fully
            toCreate.push(nid);
            this.currentlyVisible.push(nid);
        }
        else {
            // yes? well then we just need any changes that have occurred            
            toUpdate.push(nid);
        }
        this.tickLastSeen[nid] = tick;
        if (this.instance.localState.children.has(nid)) {
            for (const cid of this.instance.localState.children.get(nid)) {
                this.createOrUpdate(cid, tick, toCreate, toUpdate);
            }
        }
    }
    checkVisibility(tick) {
        const toCreate = [];
        const toUpdate = [];
        const toDelete = [];
        for (const [channelId, channel] of this.subscriptions.entries()) {
            const visibleNids = channel.getVisibileEntities(this.id);
            for (let i = 0; i < visibleNids.length; i++) {
                this.createOrUpdate(visibleNids[i], tick, toCreate, toUpdate);
            }
        }
        this.populateDeletions(tick, toDelete);
        return { toDelete, toUpdate, toCreate };
    }
}
exports.User = User;
