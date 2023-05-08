"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSubsequentFrame = exports.findInitialFrame = exports.Interpolator = void 0;
const Frame_1 = require("./Frame");
const BinaryExt_1 = require("../common/binary/BinaryExt");
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
class Interpolator {
    constructor(client) {
        this.client = client;
        //this.snapshots = []
        this.frames = [];
        this.latestFrame = null;
    }
    getInterpolatedState(interpDelay) {
        while (this.client.network.snapshots.length > 0) {
            const snapshot = this.client.network.snapshots.shift();
            const frame = new Frame_1.Frame(snapshot, this.latestFrame);
            this.frames.push(frame);
            this.latestFrame = frame;
            const predictionErrorFrame = this.client.predictor.getErrors(frame);
            //console.log({ predictionErrorFrame })
            if (predictionErrorFrame.entities.size > 0) {
                //console.log('yo there were some prediction errors')
                this.client.network.predictionErrorFrames.push(predictionErrorFrame);
            }
            this.client.predictor.cleanUp(frame.clientTick);
        }
        const now = Date.now();
        const renderTime = now - interpDelay - this.client.network.chronus.averageTimeDifference;
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
                        // not sure if this is right, needs tested in lag
                        //console.log('cleaning up', frame.clientTick - 1)
                        this.client.predictor.cleanUp(frame.clientTick - 1);
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
                    deleteEntities: [],
                };
                if (!frameA.processed) {
                    //console.log('processing frameA', frameA)
                    interpState.createEntities = frameA.createEntities.slice();
                    interpState.deleteEntities = frameA.deleteEntities.slice();
                    frameA.processed = true;
                    // is this right...?
                    //console.log('cleaning up', frameA.clientTick -1)
                    //this.client.predictor.cleanUp(frameA.clientTick - 1)
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
                    //console.log('searching for prediction', frameA.clientTick, nid, prop)
                    if (this.client.predictor.has(frameA.clientTick, nid, prop)) {
                        //console.log('this value was predicted, skip')
                        continue;
                    }
                    if (this.client.predictor.has(frameB.clientTick, nid, prop)) {
                        //console.log('this value was predicted, skip')
                        continue;
                    }
                    const entityA = frameA.entities.get(nid);
                    const entityB = frameB.entities.get(nid);
                    if (entityA && entityB) {
                        const nschema = this.client.context.getSchema(entityA.ntype);
                        const binarySpec = nschema.props[prop];
                        const binaryUtil = (0, BinaryExt_1.binaryGet)(binarySpec.type);
                        if (binarySpec.interp) {
                            // interpolated
                            const valueA = entityA[prop];
                            const valueB = entityB[prop];
                            const value = binaryUtil.interp(valueA, valueB, interpAmount);
                            interpState.updateEntities.push({ nid, prop, value });
                        }
                        else {
                            // not interpolated
                            interpState.updateEntities.push({ nid, prop, value: entityB[prop] });
                        }
                    }
                }
                frames.push(interpState);
            }
        }
        return frames;
    }
}
exports.Interpolator = Interpolator;
//# sourceMappingURL=Interpolator.js.map