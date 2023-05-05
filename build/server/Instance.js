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
        this.tick++;
        this.cache.createCachesForTick(this.tick);
        this.users.forEach(user => {
            // TODO aggregate visible entities and messages
            // demo is instead just sending message from a channel
            const buffer = (0, createSnapshotBufferRefactor_1.default)(user, this);
            user.send(buffer);
        });
        this.cache.deleteCachesForTick(this.tick);
    }
}
exports.Instance = Instance;
//# sourceMappingURL=Instance.js.map