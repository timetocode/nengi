"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Instance = void 0;
const LocalState_1 = require("./LocalState");
const InstanceNetwork_1 = require("./InstanceNetwork");
const EntityCache_1 = require("./EntityCache");
const createSnapshotBuffer_1 = require("../binary/snapshot/createSnapshotBuffer");
const NQueue_1 = require("../NQueue");
const EngineMessage_1 = require("../common/EngineMessage");
class Instance {
    constructor(context) {
        this.context = context;
        this.localState = new LocalState_1.LocalState();
        this.users = new Map();
        this.queue = new NQueue_1.NQueue();
        this.incrementalUserId = 0;
        this.cache = new EntityCache_1.EntityCache();
        this.tick = 1;
        this.pingIntervalMs = 10000;
        this.responseEndPoints = new Map();
        this.onConnect = (handshake) => {
            return new Promise((resolve, reject) => {
                console.log(`Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied. Received handshake ${handshake}`);
                resolve(false);
            });
        };
        this.network = new InstanceNetwork_1.InstanceNetwork(this);
    }
    attachEntity(parentNid, child) {
        this.localState.addChild(child, { nid: parentNid, ntype: 0 });
    }
    detachEntity(parentNid, child) {
        this.localState.removeEntity(child);
        //this.localState.removeChild(parentNid, child)
    }
    respond(endpoint, callback) {
        this.responseEndPoints.set(endpoint, callback);
    }
    step() {
        const timestamp = Date.now();
        const timeSyncEngineMessage = {
            ntype: EngineMessage_1.EngineMessage.TimeSync,
            timestamp
        };
        this.tick++;
        this.cache.createCachesForTick(this.tick);
        this.users.forEach(user => {
            if (user.lastSentInstanceTick === 0) {
                // this is the first frame connected!
                user.queueEngineMessage(timeSyncEngineMessage);
            }
            else {
                // send timeSyncs every 20 ticks
                if (user.lastSentInstanceTick % 20 === 0) {
                    user.queueEngineMessage(timeSyncEngineMessage);
                }
            }
            if (user.lastSentPingTimestamp < timestamp - this.pingIntervalMs) {
                user.queueEngineMessage({
                    ntype: EngineMessage_1.EngineMessage.Ping,
                    latency: user.latency
                });
                user.lastSentPingTimestamp = timestamp;
            }
            user.queueEngineMessage({
                ntype: EngineMessage_1.EngineMessage.ClientTick,
                tick: user.lastReceivedClientTick
            });
            const buffer = (0, createSnapshotBuffer_1.createSnapshotBuffer)(user, this);
            user.send(buffer);
            user.lastSentInstanceTick = this.tick;
        });
        this.cache.deleteCachesForTick(this.tick);
    }
}
exports.Instance = Instance;
