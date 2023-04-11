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
        this.incrementalUserId = 1;
        this.responseEndPoints = new Map();
        this.onConnect = (handshake) => {
            return new Promise((resolve, reject) => {
                console.log('Please define an instance.onConnect handler that returns a Promise<boolean>. Connection denied.');
                resolve(false);
            });
        };
        this.networks = [];
        //this.network = new InstanceNetwork(this)
        //this.network.listen(config.port)
    }
    registerNetworkAdapter(networkAdapter, binaryWriterFactory, binaryReaderFactory) {
        const network = new InstanceNetwork_1.InstanceNetwork(this, networkAdapter, binaryWriterFactory, binaryReaderFactory);
        this.networks.push(network);
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
            var _a;
            const buffer = (0, createSnapshotBufferRefactor_1.default)(user, this); //createSnapshotBufferBrute(user, this)//createSnapshotBuffer(user, this)
            // TODO this current takes a buffer | arraybuffer and may be typeable (currently :any)       
            (_a = user.network) === null || _a === void 0 ? void 0 : _a.send(user, buffer);
            //this.network.send(user, buffer)
        });
        this.cache.deleteCachesForTick(this.tick);
    }
}
exports.Instance = Instance;
