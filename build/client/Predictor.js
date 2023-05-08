"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Predictor = void 0;
const BinaryExt_1 = require("../common/binary/BinaryExt");
const EPS = 0.0001;
const closeEnough = (value, EPSILON) => {
    return value < EPSILON && value > -EPSILON;
};
const clone = (entity, nschema) => {
    const clonedObj = {};
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const value = entity[propData.prop];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        // @ts-ignore
        clonedObj[propData.prop] = binaryUtil.clone(value);
    }
    return clonedObj;
};
class PredictionErrorFrame {
    constructor(tick) {
        this.tick = tick;
        this.entities = new Map();
    }
    add(nid, entity, predictionError) {
        let entityPredictionError = this.entities.get(nid);
        if (!entityPredictionError) {
            entityPredictionError = new PredictionErrorEntity(nid, entity);
            this.entities.set(nid, entityPredictionError);
        }
        entityPredictionError.add(predictionError);
    }
}
class PredictionErrorEntity {
    constructor(nid, entity) {
        this.nid = nid;
        this.proxy = entity;
        this.errors = [];
    }
    add(predictionError) {
        this.errors.push(predictionError);
    }
}
class PredictionErrorProperty {
    constructor(nid, prop, predictedValue, actualValue) {
        this.nid = nid;
        this.prop = prop;
        this.predictedValue = predictedValue;
        this.actualValue = actualValue;
    }
}
class PredictionFrame {
    constructor(tick) {
        this.tick = tick;
        this.entityPredictions = new Map();
    }
    add(nid, entity, props, nschema) {
        console.log('prediction created', this.tick, nid, entity, props);
        let entityPrediction = this.entityPredictions.get(nid);
        if (!entityPrediction) {
            entityPrediction = new EntityPrediction(nid, entity, props, nschema);
            this.entityPredictions.set(nid, entityPrediction);
        }
        else {
            entityPrediction.entity = entity;
            entityPrediction.props = props;
        }
    }
}
class EntityPrediction {
    constructor(nid, entity, props, nschema) {
        this.nid = nid;
        this.proxy = entity;
        this.props = props;
        this.nschema = nschema;
    }
}
class Predictor {
    constructor() {
        this.predictionFrames = new Map();
        this.latestTick = -1;
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
            predictionFrame = new PredictionFrame(tick);
            this.predictionFrames.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props, nschema);
    }
    add(tick, entity, props, nschema) {
        let predictionFrame = this.predictionFrames.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick);
            this.predictionFrames.set(tick, predictionFrame);
        }
        const proxy = clone(entity, nschema);
        //console.log('auto prediction registered', proxy)
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
        const predictionErrorFrame = new PredictionErrorFrame(frame.clientTick);
        if (frame) {
            // predictions for this frame
            const predictionFrame = this.predictionFrames.get(frame.clientTick);
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
                                console.log('prediction had an error!', prop, diff);
                                predictionErrorFrame.add(nid, entityPrediction.proxy, new PredictionErrorProperty(nid, prop, predValue, authValue));
                            }
                            else {
                                console.log('prediction was good!');
                            }
                        });
                    }
                });
            }
        }
        this.latestTick = frame.clientTick;
        return predictionErrorFrame;
    }
}
exports.Predictor = Predictor;
//# sourceMappingURL=Predictor.js.map