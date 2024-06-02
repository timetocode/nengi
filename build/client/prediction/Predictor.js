"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Predictor = void 0;
function areCloseBits(value1, value2, bits) {
    const epsilon = Math.pow(2, -bits);
    const diff = Math.abs(value1 - value2);
    const maxAbsValue = Math.max(Math.abs(value1), Math.abs(value2));
    return diff <= epsilon * maxAbsValue;
}
class Predictor {
    constructor() {
        // latestTick: number = -1
        this.predictionFrames = new Map();
        /*
        getLastPredictedState(nid: number, prop: string): StateBufferEntry | null {
            if (this.stateBuffer.has(nid)) {
                const entityState = this.stateBuffer.get(nid)!
                if (entityState.has(prop)) {
                    return entityState.get(prop)!
                }
            }
            return null
        }
    
        getLastConfirmedState(nid: number, prop: string): StateBufferEntry | null {
            if (this.confirmedStateBuffer.has(nid)) {
                const entityState = this.confirmedStateBuffer.get(nid)!
                if (entityState.has(prop)) {
                    return entityState.get(prop)!
                }
            }
            return null
        }
    
        getPendingPredictions(nid: number, startTick: number): Map<prop, StateBufferEntry> {
            const pendingPredictions: Map<prop, StateBufferEntry> = new Map()
            this.predictionFrames.forEach((predictionFrame, tick) => {
                if (tick > startTick && predictionFrame.entities.has(nid)) {
                    const predictionEntity = predictionFrame.entities.get(nid)!
                    predictionEntity.state.forEach((value, prop) => {
                        if (!pendingPredictions.has(prop)) {
                            pendingPredictions.set(prop, { predValue: value, authValue: null, deltaValue: 0, tick })
                        }
                    })
                }
            })
            return pendingPredictions
        }
    
        reapplyPendingPredictions(nid: number, startTick: number, callback?: (prop: string, value: any) => void): void {
            const pendingPredictions = this.getPendingPredictions(nid, startTick)
            pendingPredictions.forEach((entry, prop) => {
                if (this.predictionFrames.has(entry.tick)) {
                    const frame = this.predictionFrames.get(entry.tick)!
                    if (frame.entities.has(nid)) {
                        const entityRecord = frame.entities.get(nid)!
                        entityRecord.state.set(prop, entry.predValue)
                    }
                }
    
                if (callback) {
                    callback(prop, entry.predValue)
                }
            })
        }
        */
    }
    //stateBuffer: Map<nid, Map<prop, StateBufferEntry>> = new Map()
    //confirmedStateBuffer: Map<nid, Map<prop, StateBufferEntry>> = new Map()
    register(tick, nid, prop, value) {
        //if (!this.stateBuffer.has(nid)) {
        //     this.stateBuffer.set(nid, new Map())
        //}
        //const entityState = this.stateBuffer.get(nid)!
        let deltaValue = 0;
        // Compute a delta if the previous frame has a value for this prop of this entity
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
        //entityState.set(prop, { predValue: value, authValue: null, deltaValue, tick })
        if (!this.predictionFrames.has(tick)) {
            this.predictionFrames.set(tick, { processed: false, entities: new Map() });
        }
        const frame = this.predictionFrames.get(tick);
        if (!frame.entities.has(nid)) {
            frame.entities.set(nid, { state: new Map(), changes: new Map() });
        }
        const entityRecord = frame.entities.get(nid);
        entityRecord.state.set(prop, value);
        entityRecord.changes.set(prop, deltaValue);
    }
    process(frame) {
        const confirmedTick = frame.confirmedClientTick;
        //console.log(`frame ${ frame.tick} with clientConfirmedTick ${ frame.confirmedClientTick }`)
        const report = new Map();
        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (tick <= confirmedTick && !predictionFrame.processed) {
                //console.log(`processing predictionFrame ${ tick }`)
                predictionFrame.entities.forEach((predictionEntity, nid) => {
                    const authEntity = frame.entities.get(nid);
                    if (authEntity) {
                        predictionEntity.state.forEach((value, prop) => {
                            const authValue = authEntity[prop];
                            const predValue = value;
                            const deltaValue = authValue - predValue;
                            //console.log(`verifying prediction for ${prop} p:${ predValue} a: ${ authValue}, dv: ${ deltaValue}`)
                            //if (!this.confirmedStateBuffer.has(nid)) {
                            //    this.confirmedStateBuffer.set(nid, new Map())
                            //}
                            //const confirmedEntityState = this.confirmedStateBuffer.get(nid)!
                            //confirmedEntityState.set(prop, { predValue, authValue, deltaValue, tick })
                            //if (this.stateBuffer.has(nid)) {
                            //    const entityState = this.stateBuffer.get(nid)!
                            //    entityState.set(prop, { predValue, authValue, deltaValue, tick })
                            //}
                            if (!report.has(nid)) {
                                report.set(nid, new Map());
                            }
                            const state = report.get(nid);
                            if (!state.has(prop)) {
                                state.set(prop, { predValue, authValue, deltaValue, tick });
                            }
                            else {
                                const propState = state.get(prop);
                                propState.authValue = authValue;
                                propState.predValue = predValue;
                                propState.deltaValue = deltaValue;
                                propState.tick = tick;
                            }
                        });
                    }
                });
                predictionFrame.processed = true;
            }
        });
        this.predictionFrames.forEach((_, tick) => {
            if (tick <= confirmedTick) {
                this.predictionFrames.delete(tick);
            }
        });
        report.forEach((propStateMap, nid) => {
            propStateMap.forEach((stateBufferEntry, prop) => {
                if (stateBufferEntry.deltaValue === 0) {
                    propStateMap.delete(prop);
                }
            });
            if (propStateMap.size === 0) {
                report.delete(nid);
            }
        });
        return report;
    }
    isPredicted(nid, prop, tick) {
        if (this.predictionFrames.has(tick)) {
            const predictionFrame = this.predictionFrames.get(tick);
            if (predictionFrame.entities.has(nid)) {
                const predictionEntity = predictionFrame.entities.get(nid);
                if (predictionEntity.state.has(prop)) {
                    return true;
                }
            }
        }
        return false;
    }
    getPendingPredictions(nid, startTick) {
        const pendingPredictions = new Map();
        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (tick > startTick && predictionFrame.entities.has(nid)) {
                const predictionEntity = predictionFrame.entities.get(nid);
                pendingPredictions.set(tick, predictionEntity);
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
