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
class Predicto2r {
    constructor() {
        this.predictions = new Map();
    }
    addCustom(tick, entity, props) {
        return this.add(tick, entity, props);
    }
    addDiscrete(tick, entity, props) {
        return this.add(tick, entity, props);
    }
    addOblivious(tick, entity, props) {
        return this.add(tick, entity, props);
    }
    cleanUp(tick) {
    }
    add(tick, entity, props) {
        if (!this.predictions.has(entity.nid)) {
            this.predictions.set(entity.nid, new Map());
        }
        const propertyPredictions = this.predictions.get(entity.nid);
        props.forEach(prop => {
            if (propertyPredictions.has(prop)) {
                propertyPredictions.get(prop).value = entity[prop];
                propertyPredictions.get(prop).tick = tick;
            }
            else {
                propertyPredictions.set(prop, { value: entity[prop], tick });
            }
        });
    }
    isPredicted(nid, prop, tick) {
        if (!this.predictions.has(nid)) {
            return false;
        }
        const predictedEntities = this.predictions.get(nid);
        if (!predictedEntities.has(prop)) {
            return false;
        }
        const predictedProperties = predictedEntities.get(prop);
        if (predictedProperties.tick === tick) {
            return true;
        }
    }
    getErrors(frame) {
        const confirmedTick = frame.confirmedClientTick;
        const predictionErrorFrame = new PredictionErrorFrame_1.PredictionErrorFrame(confirmedTick);
        this.predictions.forEach((predictedEntity, nid) => {
            const auth = frame.entities.get(nid);
            predictedEntity.forEach((predictedProperty, prop) => {
                if (predictedProperty.tick === confirmedTick) {
                    const authValue = auth[prop];
                    const predValue = predictedProperty.value;
                    if (!areCloseBits(authValue, predValue, 12)) {
                        predictionErrorFrame.add(nid, auth, new PredictionErrorProperty_1.PredictionErrorProperty(nid, prop, predValue, authValue));
                    }
                }
            });
        });
        /*
      
        const predictionFrame = this.p.get(confirmedTick)

        if (predictionFrame) {
            predictionFrame.entityPredictions.forEach(entityPrediction => {
                // predictions for this entity
                const nid = entityPrediction.nid
                const authoritative = frame.entities.get(nid)
                if (authoritative) {
                    entityPrediction.props.forEach(prop => {
                        const authValue = authoritative![prop]
                        const predValue = entityPrediction.state[prop]

                        if (!areCloseBits(authValue, predValue, 12)) {
                            predictionErrorFrame.add(
                                nid,
                                entityPrediction.state,
                                new PredictionErrorProperty(nid, prop, predValue, authValue)
                            )
                        }
                    })
                }
            })
        }
        */
        return predictionErrorFrame;
    }
}
class Predictor {
    constructor() {
        this.latestTick = -1;
        // per entity, tracks the tick range that a given property is being predicted
        this.predictionRange = new Map();
        this.continuous = new Map();
        this.discrete = new Map();
        this.detached = new Map();
        // used for detatched predictions, stores the authoritative and predicted states of an entity
        this.multiState = new Map();
        this.predictionFrames = new Map();
    }
    register(tick, nid, prop, value) {
        // compute a delta if the previous frame has a value for this prop of this entity
        let deltaValue = 0;
        if (this.predictionFrames.has(tick - 1)) {
            const previousFrame = this.predictionFrames.get(tick - 1);
            if (previousFrame.entities.has(nid)) {
                const previousEntityState = previousFrame.entities.get(nid);
                if (previousEntityState.state.has(prop)) {
                    const previousValue = previousEntityState.state.get(prop);
                    deltaValue = value - previousValue;
                }
            }
        }
        if (!this.predictionFrames.has(tick)) {
            this.predictionFrames.set(tick, { processed: false, entities: new Map() });
        }
        const frame = this.predictionFrames.get(tick);
        if (!frame.entities.has(nid)) {
            frame.entities.set(nid, { state: new Map(), changes: new Map(), multi: new Map() });
        }
        const entityRecord = frame.entities.get(nid);
        entityRecord.state.set(prop, value);
        entityRecord.changes.set(prop, deltaValue);
    }
    process(frame) {
        const confirmedTick = frame.confirmedClientTick;
        console.log(`frame ${frame.tick} with clientConfirmedTick ${frame.confirmedClientTick}`);
        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (tick <= confirmedTick && !predictionFrame.processed) {
                console.log(`processing predictionFrame ${tick}`);
                predictionFrame.entities.forEach((predictionEntity, nid) => {
                    const authEntity = frame.entities.get(nid);
                    if (authEntity) {
                        predictionEntity.state.forEach((value, prop) => {
                            const authValue = authEntity[prop];
                            const predValue = value;
                            const deltaValue = authValue - predValue;
                            console.log(`verifying prediction for ${prop} p:${predValue} a: ${authValue}, dv: ${deltaValue}`);
                            predictionEntity.multi.set(prop, { authValue, predValue, deltaValue });
                        });
                    }
                });
                predictionFrame.processed = true;
            }
        });
    }
    isPredicted(nid, prop, tick) {
        if (this.predictionRange.has(nid)) {
            const propertyPredictionRanges = this.predictionRange.get(nid);
            if (propertyPredictionRanges.has(prop)) {
                const range = propertyPredictionRanges.get(prop);
                if (tick >= range.start && tick <= range.end) {
                    return true;
                }
            }
        }
        return false;
    }
    addDetached(tick, entity, props) {
        if (!this.multiState.has(entity.nid)) {
            this.multiState.set(entity.nid, new Map());
        }
        const multiProps = this.multiState.get(entity.nid);
        props.forEach(prop => {
            if (!multiProps.has(prop)) {
                multiProps.set(prop, { auth: entity[prop], pred: entity[prop] });
            }
            else {
                const multiProp = multiProps.get(prop);
                multiProp.pred = entity[prop];
            }
        });
        let predictionFrame = this.detached.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.detached.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props);
        this.createOrUpdatePredictionRange(tick, entity, props);
    }
    createOrUpdatePredictionRange(tick, entity, props) {
        if (!this.predictionRange.has(entity.nid)) {
            this.predictionRange.set(entity.nid, new Map());
        }
        const predictionRangeProps = this.predictionRange.get(entity.nid);
        props.forEach(prop => {
            if (!predictionRangeProps.has(prop)) {
                predictionRangeProps.set(prop, { start: tick, end: tick });
            }
            else {
                predictionRangeProps.get(prop).end = tick;
            }
        });
    }
    addDiscrete(tick, entity, props) {
        let predictionFrame = this.discrete.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.discrete.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props);
        this.createOrUpdatePredictionRange(tick, entity, props);
    }
    addCustom(tick, entity, props) {
        let predictionFrame = this.continuous.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.continuous.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props);
        this.createOrUpdatePredictionRange(tick, entity, props);
    }
    // deprecated
    add(tick, entity, props, nschema) {
        let predictionFrame = this.continuous.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.continuous.set(tick, predictionFrame);
        }
        const proxy = (0, clone_1.clone)(entity, nschema);
        predictionFrame.add(entity.nid, proxy, props);
    }
    has(tick, nid, prop) {
        const predictionFrame = this.continuous.get(tick);
        if (predictionFrame) {
            const entityPrediction = predictionFrame.entityPredictions.get(nid);
            if (entityPrediction) {
                return entityPrediction.props.indexOf(prop) !== -1;
            }
        }
        return false;
    }
    // returns authoritative and the final predicted state for entities that 
    // have finished their detached predictions; the authoritative state conitnues
    // to change every frame if new network data comes through for it
    // and the intended usage is to allow the game logic to interp between the last
    // predicted position and true authoritative position (which might be the same, in
    // an ideal scenario, but also the auth position can continue to change)
    getMultistate() {
        const out = [];
        this.multiState.forEach((propDualStates, nid) => {
            propDualStates.forEach((state, prop) => {
                // only include those who are not being actively predicted
                if (!this.isPredicted(nid, prop, this.latestTick)) {
                    out.push({ nid, prop, auth: state.auth, pred: state.pred });
                }
            });
        });
        return out;
    }
    getErrors(frame) {
        const confirmedTick = frame.confirmedClientTick;
        const predictionErrorFrame = new PredictionErrorFrame_1.PredictionErrorFrame(confirmedTick);
        if (frame) {
            this.multiState.forEach((propDualStates, nid) => {
                if (frame.entities.has(nid)) {
                    const authEntity = frame.entities.get(nid);
                    propDualStates.forEach((state, prop) => {
                        state.auth = authEntity[prop];
                    });
                }
            });
            // we dont reconcile or consider desync for detached predictions
            this.detached.forEach((predictionFrame, clientTick) => {
                if (predictionFrame.tick > confirmedTick) {
                }
            });
            // TODO we still need to delete these^ eventually as well as multiState entitries
            // for discrete predictions, the server has often processed numerous frames from the client
            // and confirms only the last frame, so we need to dig back through the predictions to find any
            // that would've been encompassed within this range (anything before confirmedTick) and then
            // reconcile it if there is a desync
            this.discrete.forEach((predictionFrame, clientTick) => {
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
                    // we can delete the discrete prediction now, it only gets touched once
                    this.discrete.delete(clientTick);
                }
            });
            // continuous predictions are often made every frame, but we only care about the most recent state
            // which will be in the latest confirmedTick, anything before this can be discarded
            const predictionFrame = this.continuous.get(confirmedTick);
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
            this.continuous.forEach((predictionFrame, clientTick) => {
                if (clientTick <= confirmedTick) {
                    // delete anything old
                    this.continuous.delete(clientTick);
                }
            });
        }
        this.latestTick = frame.confirmedClientTick;
        return predictionErrorFrame;
    }
    cleanUp(tick) {
        return;
        // trying to handle clean up within getErrors instead;
        // does this make sense? do we do this here or at the time we have finished reading the data 
        this.continuous.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.continuous.delete(predictionFrame.tick);
            }
        });
    }
}
exports.Predictor = Predictor;
