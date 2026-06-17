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
        this.channelOpens = args.channelOpens || [];
        this.channelEntityCreates = args.channelEntityCreates || [];
        this.channelHeaderUpdates = args.channelHeaderUpdates || [];
        this.channelCloses = args.channelCloses || [];
        this.skipInterpolationNids = new Set(args.skipInterpolationNids || []);
        this.openedChannels = args.openedChannels || [];
        this.closedChannels = args.closedChannels || [];
        this.createEntities = args.createEntities;
        this.updateEntities = args.updateEntities;
        this.deleteEntities = args.deleteEntities;
        this.deletedEntities = args.deletedEntities;
        this.messages = args.messages;
        this.interpolatedMessages = args.interpolatedMessages || [];
        this.channels = args.channels || [];
    }
}
exports.Frame = Frame;
