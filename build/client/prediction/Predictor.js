"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Predictor = void 0;
const PredictionErrorFrame_1 = require("./PredictionErrorFrame");
const PredictionErrorProperty_1 = require("./PredictionErrorProperty");
const PredictionFrame_1 = require("./PredictionFrame");
const clone_1 = require("./clone");
const EPS = 0.0001;
const closeEnough = (value, EPSILON) => {
    return value < EPSILON && value > -EPSILON;
};
class Predictor {
    constructor() {
        this.predictionFrames = new Map();
        this.latestTick = -1;
        this.generalPrediction = new Map();
    }
    cleanUp(tick) {
        this.predictionFrames.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.predictionFrames.delete(predictionFrame.tick);
            }
        });
    }
    addCustom(tick, entity, props, nschema) {
        let predictionFrame = this.predictionFrames.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.predictionFrames.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props, nschema);
        if (!this.generalPrediction.has(entity.nid)) {
            console.log('did not have general prediction, creating one!', entity.nid, new Set(props));
            this.generalPrediction.set(entity.nid, new Set(props));
        }
    }
    add(tick, entity, props, nschema) {
        let predictionFrame = this.predictionFrames.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.predictionFrames.set(tick, predictionFrame);
        }
        const proxy = (0, clone_1.clone)(entity, nschema);
        predictionFrame.add(entity.nid, proxy, props, entity.protocol);
    }
    has(tick, nid, prop) {
        const predictionFrame = this.predictionFrames.get(tick);
        if (predictionFrame) {
            const entityPrediction = predictionFrame.entityPredictions.get(nid);
            if (entityPrediction) {
                return entityPrediction.props.indexOf(prop) !== -1;
            }
        }
        return false;
    }
    getErrors(frame) {
        const predictionErrorFrame = new PredictionErrorFrame_1.PredictionErrorFrame(frame.confirmedClientTick);
        if (frame) {
            // predictions for this frame
            const predictionFrame = this.predictionFrames.get(frame.confirmedClientTick);
            if (predictionFrame) {
                predictionFrame.entityPredictions.forEach(entityPrediction => {
                    // predictions for this entity
                    const nid = entityPrediction.nid;
                    const authoritative = frame.entities.get(nid);
                    if (authoritative) {
                        entityPrediction.props.forEach(prop => {
                            const authValue = authoritative[prop];
                            const predValue = entityPrediction.proxy[prop];
                            const diff = authValue - predValue;
                            if (!closeEnough(diff, EPS)) {
                                predictionErrorFrame.add(nid, entityPrediction.proxy, new PredictionErrorProperty_1.PredictionErrorProperty(nid, prop, predValue, authValue));
                            }
                        });
                    }
                });
            }
        }
        this.latestTick = frame.confirmedClientTick;
        return predictionErrorFrame;
    }
}
exports.Predictor = Predictor;
//# sourceMappingURL=Predictor.js.map