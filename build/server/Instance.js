"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Instance = void 0;
const LocalState_1 = require("./LocalState");
const InstanceNetwork_1 = require("./InstanceNetwork");
const EntityCache_1 = require("./EntityCache");
const createSnapshotBuffer_1 = __importDefault(require("../binary/snapshot/createSnapshotBuffer"));
const NQueue_1 = require("../NQueue");
const EngineMessage_1 = require("../common/EngineMessage");
const Endpoint_1 = require("../common/Endpoint");
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
            console.warn(`Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied. Received handshake ${handshake}`);
            return Promise.resolve(false);
        };
        this.network = new InstanceNetwork_1.InstanceNetwork(this);
    }
    attachChild(parent, child) {
        return this.localState.addChild(parent, child);
    }
    detachChild(parent, child) {
        this.localState.removeChild(parent, child);
    }
    markDirty(entity) {
        return this.localState.markDirty(entity);
    }
    respond(endpoint, callback) {
        this.responseEndPoints.set((0, Endpoint_1.getEndpointId)(endpoint), {
            endpoint: (0, Endpoint_1.getEndpointDefinition)(endpoint),
            callback: callback
        });
    }
    step() {
        const timestamp = Date.now();
        const timeSyncEngineMessage = {
            ntype: EngineMessage_1.EngineMessage.TimeSync,
            timestamp
        };
        this.tick++;
        this.cache.createCachesForTick(this.tick);
        this.network.resetSharedUpdateFragments();
        this.users.forEach(user => {
            user.queueEngineMessage(timeSyncEngineMessage);
            if (user.lastSentPingTimestamp < timestamp - this.pingIntervalMs) {
                const serverTimeMs = performance.now();
                user.lastSentPingTimeMs = serverTimeMs;
                user.queueEngineMessage({
                    ntype: EngineMessage_1.EngineMessage.Ping,
                    latency: Math.max(0, Math.min(65535, Math.round(user.roundTripMs))),
                    pingId: user.nextPing(),
                    serverTimeMs
                });
                user.lastSentPingTimestamp = timestamp;
            }
            user.queueEngineMessage({
                ntype: EngineMessage_1.EngineMessage.ClientTick,
                tick: user.lastReceivedClientTick
            });
            const buffer = (0, createSnapshotBuffer_1.default)(user, this);
            if (this.network.snapshotPerformanceEnabled) {
                // Keep adapter send timing separate from snapshot construction:
                // WebSocket implementations may queue synchronously while OS I/O
                // continues outside this measured server tick.
                const sendStart = performance.now();
                user.send(buffer);
                this.network.recordSnapshotSend(performance.now() - sendStart);
            }
            else {
                user.send(buffer);
            }
            user.lastSentInstanceTick = this.tick;
        });
        this.cache.deleteCachesForTick(this.tick);
        this.localState.channels.forEach(channel => {
            var _a, _b;
            (_a = channel.clearBroadcastMessages) === null || _a === void 0 ? void 0 : _a.call(channel);
            (_b = channel.clearSnapshotDeltas) === null || _b === void 0 ? void 0 : _b.call(channel);
        });
        this.localState.releaseDeferredIds();
        this.localState.clearDirty();
    }
}
exports.Instance = Instance;
