"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelAABB2D = void 0;
const CulledChannel_1 = require("./CulledChannel");
const pointInAABB2D = (p, view) => {
    const startX = view.x - view.halfWidth;
    const startY = view.y - view.halfHeight;
    const endX = view.x + view.halfWidth;
    const endY = view.y + view.halfHeight;
    return (p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY);
};
class ChannelAABB2D extends CulledChannel_1.CulledChannel {
    constructor(localState) {
        super(localState, pointInAABB2D);
    }
}
exports.ChannelAABB2D = ChannelAABB2D;
