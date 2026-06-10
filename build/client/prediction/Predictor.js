"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionOperationStatus = exports.PredictionOperationKind = exports.PredictionLog = exports.Predictor = void 0;
const PredictionErrorFrame_1 = require("./PredictionErrorFrame");
const PredictionErrorProperty_1 = require("./PredictionErrorProperty");
const PredictionFrame_1 = require("./PredictionFrame");
const clone_1 = require("./clone");
const PredictionLog_1 = require("./PredictionLog");
const EPS = 0.0001;
const closeEnough = (value, EPSILON) => {
    return value < EPSILON && value > -EPSILON;
};
function targetKey(target) {
    return `${target.nid}:${target.props ? target.props.slice().sort().join(',') : '*'}`;
}
function targetsOverlap(a, b) {
    if (a.nid !== b.nid) {
        return false;
    }
    if (!a.props || !b.props) {
        return true;
    }
    for (let i = 0; i < a.props.length; i++) {
        if (b.props.indexOf(a.props[i]) > -1) {
            return true;
        }
    }
    return false;
}
class Predictor {
    constructor() {
        this.predictionFrames = new Map();
        this.log = new PredictionLog_1.PredictionLog();
        this.latestTick = -1;
        this.reconciliationHandlers = new Set();
    }
    cleanUp(tick) {
        this.predictionFrames.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.predictionFrames.delete(predictionFrame.tick);
            }
        });
        this.log.pruneResolvedBefore(tick - 50);
    }
    addCommand(command, tick, options = {}) {
        return this.log.addCommand(command, tick, options);
    }
    addState(payload, tick, options = {}) {
        return this.log.addState(payload, tick, options);
    }
    onReconcile(handler) {
        this.reconciliationHandlers.add(handler);
        return () => {
            this.reconciliationHandlers.delete(handler);
        };
    }
    addRequest(requestId, endpointId, payload, tick, options = {}) {
        return this.log.addRequest(requestId, endpointId, payload, tick, options);
    }
    resolveRequest(requestId, response, frame, store) {
        return this.log.resolveRequest(requestId, response, frame, store);
    }
    rejectRequest(requestId, error, frame, store) {
        return this.log.rejectRequest(requestId, error, frame, store);
    }
    resolveFrame(frame, store) {
        const resolutions = this.log.confirmTick(frame.confirmedClientTick, frame, store);
        this.emitReconciliations(frame, store, resolutions);
        return resolutions;
    }
    addCustom(tick, entity, props, nschema) {
        let predictionFrame = this.predictionFrames.get(tick);
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame_1.PredictionFrame(tick);
            this.predictionFrames.set(tick, predictionFrame);
        }
        const proxy = Object.assign({}, entity);
        predictionFrame.add(entity.nid, proxy, props, nschema);
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
    getErrors(frame, entities) {
        const predictionErrorFrame = new PredictionErrorFrame_1.PredictionErrorFrame(frame.confirmedClientTick);
        if (frame) {
            // predictions for this frame
            const predictionFrame = this.predictionFrames.get(frame.confirmedClientTick);
            if (predictionFrame) {
                predictionFrame.entityPredictions.forEach(entityPrediction => {
                    // predictions for this entity
                    const nid = entityPrediction.nid;
                    const authoritative = entities.get(nid);
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
    emitReconciliations(frame, store, resolutions) {
        if (this.reconciliationHandlers.size === 0 || resolutions.length === 0) {
            return;
        }
        const byTarget = new Map();
        for (let i = 0; i < resolutions.length; i++) {
            const operation = resolutions[i].operation;
            for (let j = 0; j < operation.affected.length; j++) {
                const target = operation.affected[j];
                const key = targetKey(target);
                let entry = byTarget.get(key);
                if (!entry) {
                    entry = { target, confirmed: [] };
                    byTarget.set(key, entry);
                }
                entry.confirmed.push(operation);
            }
        }
        byTarget.forEach(entry => {
            const authority = store.get(entry.target.nid);
            const pending = this.log.getPendingByTarget(entry.target);
            const mismatches = this.collectMismatches(entry.confirmed, entry.target, authority);
            const event = {
                frame,
                confirmedClientTick: frame.confirmedClientTick,
                store,
                target: entry.target,
                authority,
                confirmed: entry.confirmed,
                pending,
                mismatches,
                dropConfirmed: () => {
                    for (let i = 0; i < entry.confirmed.length; i++) {
                        this.log.discard(entry.confirmed[i]);
                    }
                },
                dropPending: () => {
                    this.log.discardWhere(operation => operation.status === PredictionLog_1.PredictionOperationStatus.Pending &&
                        operation.affected.some(target => targetsOverlap(target, entry.target)));
                }
            };
            this.reconciliationHandlers.forEach(handler => handler(event));
        });
    }
    collectMismatches(operations, target, authority) {
        const mismatches = [];
        if (!authority) {
            return mismatches;
        }
        const latestExpected = new Map();
        const sorted = operations.slice().sort((a, b) => a.clientTick - b.clientTick || a.id - b.id);
        for (let i = 0; i < sorted.length; i++) {
            const operation = sorted[i];
            const expected = operation.options.expected || [];
            for (let j = 0; j < expected.length; j++) {
                if (expected[j].nid !== target.nid) {
                    continue;
                }
                const props = Object.keys(expected[j].values);
                for (let k = 0; k < props.length; k++) {
                    const prop = props[k];
                    if (target.props && target.props.indexOf(prop) === -1) {
                        continue;
                    }
                    latestExpected.set(prop, { operation, value: expected[j].values[prop] });
                }
            }
        }
        latestExpected.forEach((expected, prop) => {
            if (authority[prop] !== expected.value) {
                mismatches.push({
                    operation: expected.operation,
                    nid: target.nid,
                    prop,
                    expected: expected.value,
                    authoritative: authority[prop]
                });
            }
        });
        return mismatches;
    }
}
exports.Predictor = Predictor;
var PredictionLog_2 = require("./PredictionLog");
Object.defineProperty(exports, "PredictionLog", { enumerable: true, get: function () { return PredictionLog_2.PredictionLog; } });
Object.defineProperty(exports, "PredictionOperationKind", { enumerable: true, get: function () { return PredictionLog_2.PredictionOperationKind; } });
Object.defineProperty(exports, "PredictionOperationStatus", { enumerable: true, get: function () { return PredictionLog_2.PredictionOperationStatus; } });
