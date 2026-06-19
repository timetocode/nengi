"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = void 0;
class Frame {
    constructor(args) {
        this.tick = args.tick;
        this.confirmedClientTick = args.confirmedClientTick;
        this.timestamp = args.timestamp;
        this.receivedAt = args.receivedAt;
        this.channelOpens = args.channelOpens || [];
        this.channelHeaderUpdates = args.channelHeaderUpdates || [];
        this.channelCloses = args.channelCloses || [];
        this.skipInterpolationNids = new Set(args.skipInterpolationNids || []);
        this.openedChannels = args.openedChannels || [];
        this.closedChannels = args.closedChannels || [];
        this.messages = args.messages;
        this.interpolatedMessages = args.interpolatedMessages || [];
        this.channels = args.channels || [];
    }
    getChannel(channelId) {
        for (let i = 0; i < this.channels.length; i++) {
            if (this.channels[i].channelId === channelId) {
                return this.channels[i];
            }
        }
        return undefined;
    }
    requireChannel(channelId) {
        const channel = this.getChannel(channelId);
        if (!channel) {
            throw new Error(`Frame does not contain channel ${channelId}.`);
        }
        return channel;
    }
    hasChannel(channelId) {
        return this.getChannel(channelId) !== undefined;
    }
}
exports.Frame = Frame;
