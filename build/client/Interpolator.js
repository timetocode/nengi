"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interpolator = void 0;
class Interpolator {
    constructor(client) {
        this.client = client;
    }
    getInterpolatedState(interpDelay) {
        return this.client.network.drainFrames();
    }
}
exports.Interpolator = Interpolator;
