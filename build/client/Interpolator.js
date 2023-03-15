"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSubsequentFrame = exports.findInitialFrame = exports.Interpolator = void 0;
const Frame_1 = require("./Frame");
const findInitialFrame = (frames, renderTime) => {
    for (var i = frames.length - 1; i >= 0; i--) {
        var frame = frames[i];
        if (frame.timestamp < renderTime) {
            return frame;
        }
    }
    return null;
};
exports.findInitialFrame = findInitialFrame;
const findSubsequentFrame = (frames, previousTick) => {
    for (var i = 0; i < frames.length; i++) {
        if (frames[i].tick === previousTick + 1) {
            return frames[i];
        }
    }
    return null;
};
exports.findSubsequentFrame = findSubsequentFrame;
const lerp = function (a, b, portion) {
    return a + ((b - a) * portion);
};
class Interpolator {
    constructor(client) {
        this.client = client;
        //this.snapshots = []
        this.frames = [];
        this.latestFrame = null;
    }
    // TODO add all the creates and deletes
    getInterpolatedState() {
        while (this.client.network.snapshots.length > 0) {
            const snapshot = this.client.network.snapshots.shift();
            if (snapshot) { // extra check to satisfy ts, redo
                const frame = new Frame_1.Frame(snapshot, this.latestFrame);
                this.frames.push(frame);
                this.latestFrame = frame;
            }
        }
        const now = performance.now();
        const renderTime = now - 100;
        const frameA = findInitialFrame(this.frames, renderTime);
        const frames = [];
        if (frameA) {
            const frameB = findSubsequentFrame(this.frames, frameA.tick);
            //console.log('this.frames.length', frameA.tick, this.frames.length, renderTime)
            // late frames (frames before frameA)
            // TODO this.frames.length keeps growing! we need to free memory
            for (let i = this.frames.length - 1; i > -1; i--) {
                const frame = this.frames[i];
                if (frame.tick < frameA.tick && !frame.processed) {
                    //console.log('late', frame)
                    if (!frame.processed) {
                        frames.push(frame);
                        frame.processed = true;
                        this.frames.splice(i, 1);
                    }
                    else {
                        this.frames.splice(i, 1);
                    }
                }
            }
            frames.reverse();
            if (!frameB) {
                //console.log('no frame b')
            }
            if (frameB && !frameB.processed) {
                const total = frameB.timestamp - frameA.timestamp;
                const portion = renderTime - frameA.timestamp;
                const interpAmount = portion / total;
                // TODO type
                const interpState = {
                    createEntities: [],
                    updateEntities: [],
                    deleteEntities: []
                };
                if (!frameA.processed) {
                    //console.log('processing frameA', frameA)
                    interpState.createEntities = frameA.createEntities.slice();
                    interpState.deleteEntities = frameA.deleteEntities.slice();
                    frameA.processed = true;
                }
                for (let i = 0; i < frameA.updateEntities.length; i++) {
                    const { nid, prop, value } = frameA.updateEntities[i];
                    // if no update in frameB, then entity's correct state is update.value
                    if (frameB.updateEntities.findIndex(x => x.nid === nid && x.prop === prop) === -1) {
                        interpState.updateEntities.push({ nid, prop, value });
                    }
                }
                for (let i = 0; i < frameB.updateEntities.length; i++) {
                    const { nid, prop } = frameB.updateEntities[i];
                    const entityA = frameA.entities.get(nid);
                    const entityB = frameB.entities.get(nid);
                    if (entityA && entityB) {
                        // correct state is update.prop interped from a to b
                        // TODO later, actual interpolation differences for diff types
                        const valueA = entityA[prop];
                        const valueB = entityB[prop];
                        const value = lerp(valueA, valueB, interpAmount);
                        //console.log('A & B interpolation')
                        interpState.updateEntities.push({ nid, prop, value });
                    }
                    // TODO missing case where this prop is not supposed to be interpolated
                    // in which case return state from frameB
                }
                frames.push(interpState);
            }
        }
        return frames;
    }
}
exports.Interpolator = Interpolator;
