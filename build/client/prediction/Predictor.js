"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Predictor = void 0;
const PredictionErrorFrame_1 = require("./PredictionErrorFrame");
const PredictionErrorProperty_1 = require("./PredictionErrorProperty");
const PredictionFrame_1 = require("./PredictionFrame");
const clone_1 = require("./clone");
const EPS = 0.001;
const buffer = new ArrayBuffer(8);
const floatView = new Float64Array(buffer);
const intView = new Uint32Array(buffer);
function floatToIntBits(value) {
    floatView[0] = value;
    return intView[0];
}
function areCloseBits(value1, value2, bits) {
    const epsilon = Math.pow(2, -bits);
    const diff = Math.abs(value1 - value2);
    const maxAbsValue = Math.max(Math.abs(value1), Math.abs(value2));
    return diff <= epsilon * maxAbsValue;
}
function areCloseBits_NOTWORKING(value1, value2, bits) {
    const int1 = floatToIntBits(value1);
    const int2 = floatToIntBits(value2);
    const diff = Math.abs(int1 - int2);
    return diff <= (1 << bits);
}
const closeEnough = (value, EPSILON) => {
    return value < EPSILON && value > -EPSILON;
};
class Predictor {
    constructor() {
        this.continuousPredictions = new Map();
        this.latestTick = -1;
        // newish
        this.predictionRange = new Map();
        this.discretePredictions = new Map();
        this.obliviousPredictions = new Map();
    }
    isTickPredictedForEntity(nid, tick) {
        if (this.predictionRange.has(nid)) {
            const range = this.predictionRange.get(nid);
            if (tick >= range.start && tick <= range.end) {
                return true;
            }
        }
        return false;
    }
    addOblivious(tick, entity, props) {
        let predictionFrame = this.obliviousPredictions.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.obliviousPredictions.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props);
        if (!this.predictionRange.has(entity.nid)) {
            this.predictionRange.set(entity.nid, { start: tick, end: tick });
        }
        else {
            console.log('oblvious prediction extended to tick', tick);
            this.predictionRange.get(entity.nid).end = tick;
        }
    }
    addDiscrete(tick, entity, props) {
        let predictionFrame = this.discretePredictions.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.discretePredictions.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props);
        if (!this.predictionRange.has(entity.nid)) {
            this.predictionRange.set(entity.nid, { start: tick, end: tick });
        }
        else {
            this.predictionRange.get(entity.nid).end = tick;
        }
    }
    //addContinuous(tick: number, )
    addCustom(tick, entity, props) {
        let predictionFrame = this.continuousPredictions.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.continuousPredictions.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props);
        if (!this.predictionRange.has(entity.nid)) {
            this.predictionRange.set(entity.nid, { start: tick, end: tick });
        }
        else {
            this.predictionRange.get(entity.nid).end = tick;
        }
    }
    add(tick, entity, props, nschema) {
        let predictionFrame = this.continuousPredictions.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.continuousPredictions.set(tick, predictionFrame);
        }
        const proxy = (0, clone_1.clone)(entity, nschema);
        predictionFrame.add(entity.nid, proxy, props);
    }
    has(tick, nid, prop) {
        const predictionFrame = this.continuousPredictions.get(tick);
        if (predictionFrame) {
            const entityPrediction = predictionFrame.entityPredictions.get(nid);
            if (entityPrediction) {
                return entityPrediction.props.indexOf(prop) !== -1;
            }
        }
        return false;
    }
    getErrors(frame) {
        const confirmedTick = frame.confirmedClientTick;
        const predictionErrorFrame = new PredictionErrorFrame_1.PredictionErrorFrame(confirmedTick);
        if (frame) {
            {
                this.obliviousPredictions.forEach((predictionFrame, clientTick) => {
                    if (clientTick <= confirmedTick) {
                        this.obliviousPredictions.delete(clientTick);
                    }
                });
            }
            {
                this.discretePredictions.forEach((predictionFrame, clientTick) => {
                    if (clientTick <= confirmedTick) {
                        predictionFrame.entityPredictions.forEach(entityPrediction => {
                            // predictions for this entity
                            const nid = entityPrediction.nid;
                            const authoritative = frame.entities.get(nid);
                            if (authoritative) {
                                entityPrediction.props.forEach(prop => {
                                    const authValue = authoritative[prop];
                                    const predValue = entityPrediction.state[prop];
                                    if (!areCloseBits(authValue, predValue, 12)) {
                                        predictionErrorFrame.add(nid, entityPrediction.state, new PredictionErrorProperty_1.PredictionErrorProperty(nid, prop, predValue, authValue));
                                    }
                                });
                            }
                        });
                        this.discretePredictions.delete(clientTick);
                    }
                });
            }
            {
                // predictions for this frame
                const predictionFrame = this.continuousPredictions.get(confirmedTick);
                if (predictionFrame) {
                    predictionFrame.entityPredictions.forEach(entityPrediction => {
                        // predictions for this entity
                        const nid = entityPrediction.nid;
                        const authoritative = frame.entities.get(nid);
                        if (authoritative) {
                            entityPrediction.props.forEach(prop => {
                                const authValue = authoritative[prop];
                                const predValue = entityPrediction.state[prop];
                                if (!areCloseBits(authValue, predValue, 12)) {
                                    predictionErrorFrame.add(nid, entityPrediction.state, new PredictionErrorProperty_1.PredictionErrorProperty(nid, prop, predValue, authValue));
                                }
                            });
                        }
                    });
                }
            }
        }
        this.latestTick = frame.confirmedClientTick;
        return predictionErrorFrame;
    }
    cleanUp(tick) {
        // does this make sense? do we do this here or at the time we have finished reading the data 
        this.continuousPredictions.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.continuousPredictions.delete(predictionFrame.tick);
            }
        });
    }
}
exports.Predictor = Predictor;
