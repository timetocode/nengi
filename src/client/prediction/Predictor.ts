
import { Schema } from '../../common/binary/schema/Schema'
import { Frame } from '../Frame'
import { PredictionErrorFrame } from './PredictionErrorFrame'
import { PredictionErrorProperty } from './PredictionErrorProperty'
import { PredictionFrame } from './PredictionFrame'
import { clone } from './clone'

const EPS = 0.001

const buffer = new ArrayBuffer(8)
const floatView = new Float64Array(buffer)
const intView = new Uint32Array(buffer)

function floatToIntBits(value: number): number {
    floatView[0] = value
    return intView[0]
}

function areCloseBits(value1: number, value2: number, bits: number): boolean {
    const epsilon = Math.pow(2, -bits)
    const diff = Math.abs(value1 - value2)
    const maxAbsValue = Math.max(Math.abs(value1), Math.abs(value2))
    return diff <= epsilon * maxAbsValue
}

function areCloseBits_NOTWORKING(value1: number, value2: number, bits: number): boolean {
    const int1 = floatToIntBits(value1)
    const int2 = floatToIntBits(value2)
    const diff = Math.abs(int1 - int2)
    return diff <= (1 << bits)
}

const closeEnough = (value: number, EPSILON: number) => {
    return value < EPSILON && value > -EPSILON
}

class Predictor {
    predictionFrames: Map<number, PredictionFrame> = new Map()
    latestTick: number = -1
    predictionRange: Map<number, { start: number, end: number }> = new Map()

    isTickPredictedForEntity(nid: number, tick: number) {
        if (this.predictionRange.has(nid)) {
            const range = this.predictionRange.get(nid)!
            if (tick >= range.start && tick <= range.end) {
                return true
            }
        }
        return false
    }

    addCustom(tick: number, entity: any, props: string[], nschema: Schema) {
        let predictionFrame = this.predictionFrames.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.predictionFrames.set(tick, predictionFrame)
        }
        const proxy = Object.assign({}, entity)
        predictionFrame.add(entity.nid, proxy, props, nschema)

        if (!this.predictionRange.has(entity.nid)) {
            this.predictionRange.set(entity.nid, { start: tick, end: tick })
        } else {
            this.predictionRange.get(entity.nid)!.end = tick
        }
    }

    add(tick: number, entity: any, props: string[], nschema: Schema) {
        let predictionFrame = this.predictionFrames.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.predictionFrames.set(tick, predictionFrame)
        }
        const proxy = clone(entity, nschema)
        predictionFrame.add(entity.nid, proxy, props, entity.protocol)
    }

    has(tick: number, nid: number, prop: string) {
        const predictionFrame = this.predictionFrames.get(tick)
        if (predictionFrame) {
            const entityPrediction = predictionFrame.entityPredictions.get(nid)
            if (entityPrediction) {
                return entityPrediction.props.indexOf(prop) !== -1
            }
        }
        return false
    }

    getErrors(frame: Frame) {
        const predictionErrorFrame = new PredictionErrorFrame(frame.confirmedClientTick)
        if (frame) {
            // predictions for this frame
            const predictionFrame = this.predictionFrames.get(frame.confirmedClientTick)

            if (predictionFrame) {
                predictionFrame.entityPredictions.forEach(entityPrediction => {
                    // predictions for this entity
                    const nid = entityPrediction.nid
                    const authoritative = frame.entities.get(nid)
                    if (authoritative) {
                        entityPrediction.props.forEach(prop => {
                            const authValue = authoritative![prop]
                            const predValue = entityPrediction.proxy[prop]
                            //const diff = authValue - predValue

                            if (!areCloseBits(authValue, predValue, 12)) {
                                predictionErrorFrame.add(
                                    nid,
                                    entityPrediction.proxy,
                                    new PredictionErrorProperty(nid, prop, predValue, authValue)
                                )
                            }
                        })
                    }
                })
            }
        }
        this.latestTick = frame.confirmedClientTick
        return predictionErrorFrame
    }

    cleanUp(tick: number) {
        this.predictionFrames.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.predictionFrames.delete(predictionFrame.tick)
            }
        })
    }
}

export { Predictor }