"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Instance = void 0;
const LocalState_1 = require("./LocalState");
const InstanceNetwork_1 = require("./InstanceNetwork");
const EntityCache_1 = require("./EntityCache");
const createSnapshotBufferRefactor_1 = __importDefault(require("../binary/snapshot/createSnapshotBufferRefactor"));
const NQueue_1 = require("../NQueue");
const IdPool_1 = require("./IdPool");
const EngineMessage_1 = require("../common/EngineMessage");
class Instance {
    constructor(context) {
        this.context = context;
        this.localState = new LocalState_1.LocalState();
        this.channelIdPool = new IdPool_1.IdPool(65535);
        this.channels = new Set();
        this.users = new Map();
        this.queue = new NQueue_1.NQueue();
        this.incrementalUserId = 0;
        this.cache = new EntityCache_1.EntityCache();
        this.tick = 1;
        this.responseEndPoints = new Map();
        this.onConnect = (handshake) => {
            return new Promise((resolve, reject) => {
                console.log('Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied.');
                resolve(false);
            });
        };
        this.network = new InstanceNetwork_1.InstanceNetwork(this);
    }
    attachEntity(parentNid, child) {
        this.localState.addChild(parentNid, child);
    }
    detachEntity(parentNid, child) {
        this.localState.removeChild(parentNid, child);
    }
    respond(endpoint, callback) {
        this.responseEndPoints.set(endpoint, callback);
    }
    registerChannel(channel) {
        const channelId = this.channelIdPool.nextId();
        channel.id = channelId;
        this.channels.add(channel);
        return channelId;
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
            if (user.lastSentInstanceTick === -1) {
                // this is the first frame connected!
                user.queueEngineMessage(timeSyncEngineMessage);
            }
            else {
                // send timeSyncs every 20 ticks
                if (user.lastSentInstanceTick % 20 === 0) {
                    user.queueEngineMessage(timeSyncEngineMessage);
                }
            }
            user.queueEngineMessage({
                ntype: EngineMessage_1.EngineMessage.ClientTick,
                tick: user.lastReceivedClientTick
            });
            const buffer = (0, createSnapshotBufferRefactor_1.default)(user, this);
            user.send(buffer);
            user.lastSentInstanceTick = this.tick;
        });
        this.cache.deleteCachesForTick(this.tick);
    }
}
exports.Instance = Instance;
//# sourceMappingURL=Instance.js.map