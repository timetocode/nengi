import { Frame } from '../Frame'

const TICK_MAX = 65535

function areCloseBits(value1: number, value2: number, bits: number): boolean {
    const epsilon = Math.pow(2, -bits)
    const diff = Math.abs(value1 - value2)
    const maxAbsValue = Math.max(Math.abs(value1), Math.abs(value2))
    return diff <= epsilon * maxAbsValue
}

function computeDelta(previousValue: number, currentValue: number): number {
    return currentValue - previousValue
}

function isTickGreater(tick1: number, tick2: number): boolean {
    if ((tick1 > tick2 && tick1 - tick2 < TICK_MAX / 2) || (tick1 < tick2 && tick2 - tick1 > TICK_MAX / 2)) {
        return true
    }
    return false
}

function tickDiff(tick1: number, tick2: number): number {
    return (tick1 - tick2 + TICK_MAX) % TICK_MAX
}

type tick = number
type nid = number
type prop = string

type PropMap = Map<prop, any>


type PredictedFrame = {
    processed: boolean
    entities: Map<nid, PredictedEntity>
}

type StateBufferEntry = {
    predValue: any,
    authValue: any,
    deltaValue: any,
    tick: tick
}

class StateChange {
    constructor(public predValue: any, public authValue: any, public deltaValue: any, public tick: number) { }
}

class PredictedEntity {
    state: Map<string, any> = new Map()
    changes: Map<string, any> = new Map()

    registerChange(prop: string, value: any, deltaValue: any) {
        this.state.set(prop, value)
        this.changes.set(prop, deltaValue)
    }
}

class PredictionFrame {
    processed: boolean = false
    entities: Map<number, PredictedEntity> = new Map()

    getOrCreateEntity(nid: number): PredictedEntity {
        if (!this.entities.has(nid)) {
            this.entities.set(nid, new PredictedEntity())
        }
        return this.entities.get(nid)!
    }
}

export class Predictor {
    predictionFrames: Map<number, PredictionFrame> = new Map()
    lastProcessedTick: number = 0
    bufferTicks: number = 500

    register(tick: number, nid: number, prop: string, value: any) {
        let deltaValue = 0

        // Compute a delta if the previous frame has a value for this prop of this entity
        const previousFrame = this.predictionFrames.get((tick - 1 + TICK_MAX) % TICK_MAX)
        if (previousFrame && previousFrame.entities.has(nid)) {
            const previousEntity = previousFrame.entities.get(nid)
            if (previousEntity && previousEntity.state.has(prop)) {
                const previousValue = previousEntity.state.get(prop)
                deltaValue = computeDelta(previousValue, value)
            }
        }

        if (!this.predictionFrames.has(tick)) {
            this.predictionFrames.set(tick, new PredictionFrame())
        }

        const frame = this.predictionFrames.get(tick)!
        const entity = frame.getOrCreateEntity(nid)
        entity.registerChange(prop, value, deltaValue)
    }

    process(frame: Frame): Map<number, Map<string, StateChange>> {
        const confirmedTick = frame.confirmedClientTick
        const predictionErrors: Map<number, Map<string, StateChange>> = new Map()

        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (isTickGreater(confirmedTick + 1, tick) && !predictionFrame.processed) {
                predictionFrame.entities.forEach((predictionEntity, nid) => {
                    const authEntity = frame.entities.get(nid)
                    if (authEntity) {
                        predictionEntity.state.forEach((predValue, prop) => {
                            const authValue = authEntity[prop]
                            const deltaValue = authValue - predValue

                            if (!predictionErrors.has(nid)) {
                                predictionErrors.set(nid, new Map())
                            }

                            const state = predictionErrors.get(nid)!
                            state.set(prop, new StateChange(predValue, authValue, deltaValue, tick))
                        })
                    }
                })
                predictionFrame.processed = true
            }
        })

        this.lastProcessedTick = confirmedTick

        // Filter out zero delta entries
        predictionErrors.forEach((propStateMap, nid) => {
            Array.from(propStateMap.keys()).forEach((prop) => {
                const stateBufferEntry = propStateMap.get(prop)!
                if (stateBufferEntry.deltaValue === 0) {
                    propStateMap.delete(prop)
                }
            })

            if (propStateMap.size === 0) {
                predictionErrors.delete(nid)
            }
        })

        return predictionErrors
    }

    cleanupOldFrames() {
        this.predictionFrames.forEach((_, tick) => {
            if (isTickGreater(this.lastProcessedTick, tick + this.bufferTicks)) {
                this.predictionFrames.delete(tick)
            }
        })
    }

    isPredicted(nid: number, prop: string, tick: number): boolean {
        const predictionFrame = this.predictionFrames.get(tick)
        return predictionFrame ? !!predictionFrame.entities.get(nid)?.state.has(prop) : false
    }

    getPendingPredictions(nid: number, startTick: number): Map<number, PredictedEntity> {
        const pendingPredictions: Map<number, PredictedEntity> = new Map()
        this.predictionFrames.forEach((predictionFrame, tick) => {
            if (isTickGreater(tick, startTick) && predictionFrame.entities.has(nid)) {
                pendingPredictions.set(tick, predictionFrame.entities.get(nid)!)
            }
        })
        return pendingPredictions
    }

    reapplyPendingPredictions(nid: number, startTick: number, callback?: (prop: string, value: any) => void): void {
        const pendingPredictions = this.getPendingPredictions(nid, startTick)
        //let newState = new Map<string, any>()

        pendingPredictions.forEach((predictionEntity, tick) => {
            predictionEntity.changes.forEach((deltaValue, prop) => {
                const previousValue = /*newState.get(prop) ||*/ predictionEntity.state.get(prop)
                const newPredictedValue = previousValue + deltaValue
                //newState.set(prop, newPredictedValue)

                // Update the state in the prediction frame
                predictionEntity.state.set(prop, newPredictedValue)

                if (callback) {
                    callback(prop, newPredictedValue)
                }
            })
        })
    }
}