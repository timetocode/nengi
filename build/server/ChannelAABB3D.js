"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelAABB3D = void 0;
const CulledChannel_1 = require("./CulledChannel");
const pointInAABB3D = (p, view) => {
    const startX = view.x - view.halfWidth;
    const startY = view.y - view.halfHeight;
    const startZ = view.z - view.halfDepth;
    const endX = view.x + view.halfWidth;
    const endY = view.y + view.halfHeight;
    const endZ = view.z + view.halfDepth;
    return (p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY &&
        p.z >= startZ &&
        p.z < endZ);
};
class ChannelAABB3D extends CulledChannel_1.CulledChannel {
    constructor(localState) {
        super(localState, pointInAABB3D);
    }
}
exports.ChannelAABB3D = ChannelAABB3D;
