"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = void 0;
class Frame {
    constructor(args) {
        this.tick = args.tick;
        this.confirmedClientTick = args.confirmedClientTick;
        this.timestamp = args.timestamp;
        this.createEntities = args.createEntities;
        this.updateEntities = args.updateEntities;
        this.deleteEntities = args.deleteEntities;
        this.deletedEntities = args.deletedEntities;
        this.messages = args.messages;
    }
}
exports.Frame = Frame;
