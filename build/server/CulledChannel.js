"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CulledChannel = void 0;
const Channel_1 = require("./Channel");
class CulledChannel extends Channel_1.Channel {
    constructor(localState, ntype) {
        super(localState, ntype);
        this.views = new Map();
        this.visibilityResolver = (object, view) => { return true; };
    }
    addMessage(message) {
        this.users.forEach(user => {
            if (this.visibilityResolver(message, this.views.get(user.id))) {
                user.queueMessage(message);
            }
        });
    }
    getVisibileEntities(userId) {
        const view = this.views.get(userId);
        const visibleNids = [];
        this.localState.children.get(this.channelEntity.nid).forEach((entity) => {
            if (this.visibilityResolver(entity, view)) {
                visibleNids.push(entity.nid);
            }
        });
        return visibleNids;
    }
}
exports.CulledChannel = CulledChannel;
