"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = void 0;
class Frame {
    constructor(args) {
        this.tick = args.tick;
        this.confirmedClientTick = args.confirmedClientTick;
        this.timestamp = args.timestamp;
        this.receivedAt = args.receivedAt;
        this.ecsCreateEntities = args.ecsCreateEntities || [];
        this.ecsCreateComponents = args.ecsCreateComponents || [];
        this.ecsDeleteEntities = args.ecsDeleteEntities || [];
        this.channelEntityCreates = args.channelEntityCreates || [];
        this.channelHeaderCreates = args.channelHeaderCreates || [];
        this.channelHeaderUpdates = args.channelHeaderUpdates || [];
        this.channelHeaderDeletes = args.channelHeaderDeletes || [];
        this.closedChannels = args.closedChannels || [];
        this.createEntities = args.createEntities;
        this.updateEntities = args.updateEntities;
        this.deleteEntities = args.deleteEntities;
        this.deletedEntities = args.deletedEntities;
        this.messages = args.messages;
    }
}
exports.Frame = Frame;
