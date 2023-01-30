"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Instance = void 0;
const Channel_1 = require("./Channel");
const LocalState_1 = __importDefault(require("./LocalState"));
const InstanceNetwork_1 = require("./InstanceNetwork");
const SpatialChannel_1 = require("./SpatialChannel");
const EntityCache_1 = __importDefault(require("./EntityCache"));
const createSnapshotBufferRefactor_1 = __importDefault(require("../binary/snapshot/createSnapshotBufferRefactor"));
class Instance {
    constructor(context, bufferConstructor) {
        this.context = context;
        this.localState = new LocalState_1.default();
        this.channelId = 1;
        this.channels = new Set();
        this.users = new Map();
        this.cache = new EntityCache_1.default();
        this.tick = 1;
        this.responseEndPoints = new Map();
        this.bufferConstructor = bufferConstructor;
        this.onConnect = (handshake) => {
            return new Promise((resolve, reject) => {
                console.log('Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied.');
                resolve(false);
            });
        };
        this.network = new InstanceNetwork_1.InstanceNetwork(this);
        //this.network.listen(config.port)
    }
    attachEntity(parent, child) {
        this.localState.addChild(parent, child);
    }
    detachEntity(parent, child) {
        this.localState.removeChild(parent, child);
    }
    respond(endpoint, callback) {
        this.responseEndPoints.set(endpoint, callback);
    }
    createChannel() {
        const channel = new Channel_1.Channel(this.localState, this.channelId++);
        this.channels.add(channel);
        return channel;
    }
    createSpatialChannel() {
        const channel = new SpatialChannel_1.SpatialChannel(this.localState, this.channelId++);
        this.channels.add(channel);
        return channel;
    }
    step() {
        this.tick++;
        this.cache.createCachesForTick(this.tick);
        this.users.forEach(user => {
            // TODO aggregate visible entities and messages
            // demo is instead just sending message from a channel
            const buffer = (0, createSnapshotBufferRefactor_1.default)(user, this); //createSnapshotBufferBrute(user, this)//createSnapshotBuffer(user, this)
            // TODO this current takes a buffer | arraybuffer
            // there may be a way to not ts-ignore this
            // @ts-ignore
            this.network.send(user, buffer);
        });
        this.cache.deleteCachesForTick(this.tick);
    }
}
exports.Instance = Instance;
