"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Predictor = void 0;
const TICK_MAX = 65535;
function areCloseBits(value1, value2, bits) {
    const epsilon = Math.pow(2, -bits);
    const diff = Math.abs(value1 - value2);
    const maxAbsValue = Math.max(Math.abs(value1), Math.abs(value2));
    return diff <= epsilon * maxAbsValue;
}
function computeDelta(previousValue, currentValue) {
    return currentValue - previousValue;
}
function isTickGreater(tick1, tick2) {
    if ((tick1 > tick2 && tick1 - tick2 < TICK_MAX / 2) || (tick1 < tick2 && tick2 - tick1 > TICK_MAX / 2)) {
        return true;
    }
    return false;
}
function tickDiff(tick1, tick2) {
    return (tick1 - tick2 + TICK_MAX) % TICK_MAX;
}
class StateChange {
    constructor(predValue, authValue, deltaValue, tick) {
        this.predValue = predValue;
        this.authValue = authValue;
        this.deltaValue = deltaValue;
        this.tick = tick;
    }
}
class PredictedEntity {
    constructor() {
        this.state = new Map();
        this.changes = new Map();
    }
    registerChange(prop, value, deltaValue) {
        this.state.set(prop, value);
        this.changes.set(prop, deltaValue);
    }
}
class PredictionFrame {
    constructor() {
        this.processed = false;
        this.entities = new Map();
    }
    getOrCreateEntity(nid) {
        if (!this.entities.has(nid)) {
            this.entities.set(nid, new PredictedEntity());
        }
        return this.entities.get(nid);
    }
}
class Predictor {
    constructor() {
        this.predictionFrames = new Map();
        this.lastProcessedTick = 0;
        this.bufferTicks = 500;
    }
    register(tick, nid, prop, value) {
        let deltaValue = 0;
        // Compute a delta if the previous frame has a value for this prop of this entity
        const previousFrame = this.predictionFrames.get((tick - 1 + TICK_MAX) % TICK_MAX);
        if (previousFrame && previousFrame.entities.has(nid)) {
            const previousEntity = previousFrame.entities.get(nid);
            if (previousEntity && previousEntity.state.has(prop)) {
                const previousValue = previousEntity.state.get(prop);
                deltaValue = computeDelta(previousValue, value);
            }
        }
        if (!this.predictionFrames.has(tick)) {
            this.predictionFrames.set(tick, new PredictionFrame());
        }
        const frame = this.predictionFrames.get(tick);
        const entity = frame.getOrCreateEntity(nid);
        entity.registerChange(prop, value, deltaValue);
    }
    process(frame) {
        const confirmedTick = frame.confirmedClientTick;
        const predictionErrors = new Map();
        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (isTickGreater(confirmedTick + 1, tick) && !predictionFrame.processed) {
                predictionFrame.entities.forEach((predictionEntity, nid) => {
                    const authEntity = frame.entities.get(nid);
                    if (authEntity) {
                        predictionEntity.state.forEach((predValue, prop) => {
                            const authValue = authEntity[prop];
                            const deltaValue = authValue - predValue;
                            if (!predictionErrors.has(nid)) {
                                predictionErrors.set(nid, new Map());
                            }
                            const state = predictionErrors.get(nid);
                            state.set(prop, new StateChange(predValue, authValue, deltaValue, tick));
                        });
                    }
                });
                predictionFrame.processed = true;
            }
        });
        this.lastProcessedTick = confirmedTick;
        // Filter out zero delta entries
        predictionErrors.forEach((propStateMap, nid) => {
            Array.from(propStateMap.keys()).forEach((prop) => {
                const stateBufferEntry = propStateMap.get(prop);
                if (stateBufferEntry.deltaValue === 0) {
                    propStateMap.delete(prop);
                }
            });
            if (propStateMap.size === 0) {
                predictionErrors.delete(nid);
            }
        });
        return predictionErrors;
    }
    cleanupOldFrames() {
        this.predictionFrames.forEach((_, tick) => {
            if (isTickGreater(this.lastProcessedTick, tick + this.bufferTicks)) {
                this.predictionFrames.delete(tick);
            }
        });
    }
    isPredicted(nid, prop, tick) {
        var _a;
        const predictionFrame = this.predictionFrames.get(tick);
        return predictionFrame ? !!((_a = predictionFrame.entities.get(nid)) === null || _a === void 0 ? void 0 : _a.state.has(prop)) : false;
    }
    getPendingPredictions(nid, startTick) {
        const pendingPredictions = new Map();
        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (isTickGreater(tick, startTick) && predictionFrame.entities.has(nid)) {
                pendingPredictions.set(tick, predictionFrame.entities.get(nid));
            }
        });
        return pendingPredictions;
    }
    reapplyPendingPredictions(nid, startTick, callback) {
        const pendingPredictions = this.getPendingPredictions(nid, startTick);
        let newState = new Map();
        pendingPredictions.forEach((predictionEntity, tick) => {
            predictionEntity.changes.forEach((deltaValue, prop) => {
                const previousValue = newState.get(prop) || predictionEntity.state.get(prop);
                const newPredictedValue = previousValue + deltaValue;
                newState.set(prop, newPredictedValue);
                // Update the state in the prediction frame
                predictionEntity.state.set(prop, newPredictedValue);
                if (callback) {
                    callback(prop, newPredictedValue);
                }
            });
        });
    }
}
exports.Predictor = Predictor;
