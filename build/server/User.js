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
        this.cache = {};
        this.cacheArr = [];
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
        this.subscriptions.set(channel.id, channel);
    }
    unsubscribe(channel) {
        this.subscriptions.delete(channel.id);
    }
    queueEngineMessage(engineMessage) {
        this.engineMessageQueue.push(engineMessage);
    }
    queueMessage(message) {
        this.messageQueue.push(message);
    }
    createOrUpdate(id, tick, toCreate, toUpdate) {
        if (!this.cache[id]) {
            //console.log('create push', id)
            toCreate.push(id);
            this.cache[id] = tick;
            this.cacheArr.push(id);
        }
        else {
            this.cache[id] = tick;
            toUpdate.push(id);
        }
        const children = this.instance.localState.parents.get(id);
        if (children) {
            children.forEach((id) => this.createOrUpdate(id, tick, toCreate, toUpdate));
        }
    }
    send(buffer) {
        this.networkAdapter.send(this, buffer);
    }
    disconnect(reason) {
        this.networkAdapter.disconnect(this, reason);
    }
    checkVisibility(tick) {
        const toCreate = [];
        const toUpdate = [];
        const toDelete = [];
        this.subscriptions.forEach(channel => {
            channel.getVisibileEntities(this.id).forEach(nid => {
                this.createOrUpdate(nid, tick, toCreate, toUpdate);
            });
        });
        for (let i = this.cacheArr.length - 1; i > -1; i--) {
            const id = this.cacheArr[i];
            if (this.cache[id] !== tick) {
                //console.log('delete', id)
                toDelete.push(id);
                this.cache[id] = 0;
                //delete this.cache[id]
                this.cacheArr.splice(i, 1);
            }
        }
        return {
            //events: nearby.events,
            noLongerVisible: toDelete,
            stillVisible: toUpdate,
            newlyVisible: toCreate //diffs.bOnly
        };
    }
}
exports.User = User;
