"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interpolator = exports.findSubsequentFrame = exports.findInitialFrame = void 0;
const BinaryExt_1 = require("../common/binary/BinaryExt");
const findInitialFrame = (frames, renderTime) => {
    for (let i = frames.length - 1; i >= 0; i--) {
        const frame = frames[i];
        if (frame.timestamp < renderTime) {
            return frame;
        }
    }
    return null;
};
exports.findInitialFrame = findInitialFrame;
const findSubsequentFrame = (frames, previousTick) => {
    for (let i = 0; i < frames.length; i++) {
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
    }
    getInterpolatedState(interpDelay) {
        const now = Date.now();
        // compute an interpolation time that is "interpDelay" into the past, handles timestamp differences
        // between server and client
        const renderTime = now - interpDelay - this.client.network.chronus.averageTimeDifference;
        const frameA = (0, exports.findInitialFrame)(this.client.network.frames, renderTime);
        const frames = [];
        const tframes = this.client.network.frames;
        if (frameA) {
            const frameB = (0, exports.findSubsequentFrame)(tframes, frameA.tick);
            for (let i = tframes.length - 1; i > -1; i--) {
                const lateFrame = tframes[i];
                // these are late frames, e.g. if the game was alt-tabbed and network data accured
                // these are outside of the interpolation window, but we need to process the in order
                // because nengi networked state is a DELTA not the full state, so we must catch up
                // on creations, deletions, and updates (mutation of individual properties)
                if (lateFrame.tick < frameA.tick) {
                    if (!lateFrame.processed) {
                        frames.push(lateFrame);
                        lateFrame.processed = true;
                        tframes.splice(i, 1);
                        //this.client.predictor.cleanUp(lateFrame.confirmedClientTick - 1)
                    }
                    else {
                        tframes.splice(i, 1);
                    }
                }
            }
            frames.reverse();
            if (frameB && !frameB.processed) {
                const total = frameB.timestamp - frameA.timestamp;
                const portion = renderTime - frameA.timestamp;
                const interpAmount = portion / total;
                const interpState = {
                    from: frameA.tick,
                    to: frameB.tick,
                    fromConfirmed: frameA.confirmedClientTick,
                    toConfirmed: frameB.confirmedClientTick,
                    createEntities: [],
                    updateEntities: [],
                    deleteEntities: [],
                };
                if (!frameA.processed) {
                    interpState.createEntities = frameA.createEntities.slice();
                    interpState.deleteEntities = frameA.deleteEntities.slice();
                    frameA.processed = true;
                    //this.client.predictor.cleanUp(frameA.confirmedClientTick - 1)
                }
                for (let i = 0; i < frameA.updateEntities.length; i++) {
                    const { nid, prop, value } = frameA.updateEntities[i];
                    // if no update in frameB, then entity's correct state is update.value
                    // this represents the final state of interpolation, the frame after there is no longer a change
                    // and is how state arrives at the exact correct value
                    // this only occurs once, otherwise it would be emit the same value repeatedly
                    if (!frameB.once && frameB.updateEntities.findIndex(x => x.nid === nid && x.prop === prop) === -1) {
                        const entityA = frameA.entities.get(nid);
                        const nschema = this.client.context.getSchema(entityA.ntype);
                        const binarySpec = nschema.props[prop];
                        // probably there needs to be a prediction-related CONTINUE cause here
                        if (binarySpec.interp) {
                            interpState.updateEntities.push({ nid, prop, value });
                        }
                        else {
                            // we skip this final state of interpolation for non-interpolated values if they have
                            // already been emitted
                            if (!frameA.once) {
                                // does this ever actually happen...? i don't think so
                                interpState.updateEntities.push({ nid, prop, value });
                            }
                        }
                    }
                }
                for (let i = 0; i < frameB.updateEntities.length; i++) {
                    const { nid, prop } = frameB.updateEntities[i];
                    const entityA = frameA.entities.get(nid);
                    const entityB = frameB.entities.get(nid);
                    if (entityA && entityB) {
                        // the main interpolation case, we have an entity in both frames A & B and we are going to lerp its state
                        // for its networked properties that have interpolation enabled
                        const nschema = this.client.context.getSchema(entityA.ntype);
                        const binarySpec = nschema.props[prop];
                        const binaryUtil = (0, BinaryExt_1.binaryGet)(binarySpec.type);
                        // the interpolator skips emitting interpolated data for entity state that is currently being predicted
                        // we have 3 different conditionals here because it is still being decided if there are differences between
                        // these 3 states that we might handle differently in the future
                        if (this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick) &&
                            this.client.predictor.isPredicted(nid, prop, frameB.confirmedClientTick)) {
                            //console.log('predicted in A and B', frameA.confirmedClientTick, frameB.confirmedClientTick)
                            continue;
                        }
                        if (this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick) &&
                            !this.client.predictor.isPredicted(nid, prop, frameB.confirmedClientTick)) {
                            //console.log('predicted in A and NOT B', frameA.confirmedClientTick, frameB.confirmedClientTick)
                            continue;
                        }
                        if (!this.client.predictor.isPredicted(nid, prop, frameA.confirmedClientTick) &&
                            this.client.predictor.isPredicted(nid, prop, frameB.confirmedClientTick)) {
                            //console.log('predicted in NOT A and B', frameA.confirmedClientTick, frameB.confirmedClientTick)
                            continue;
                        }
                        if (binarySpec.interp) {
                            // interpolated
                            const valueA = entityA[prop];
                            const valueB = entityB[prop];
                            const value = binaryUtil.interp(valueA, valueB, interpAmount);
                            interpState.updateEntities.push({ nid, prop, value });
                        }
                        else {
                            if (!frameB.once) {
                                // not interpolated, !once prevents redundantly emission of the value which isn't going to change
                                // more than once between frameA to frameB
                                interpState.updateEntities.push({ nid, prop, value: entityB[prop] });
                            }
                        }
                    }
                }
                frameB.once = true;
                frames.push(interpState);
            }
        }
        return frames;
    }
}
exports.Interpolator = Interpolator;
