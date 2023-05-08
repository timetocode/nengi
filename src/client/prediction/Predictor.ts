
import { Schema } from '../../common/binary/schema/Schema'
import { Frame } from '../Frame'
import { PredictionErrorFrame } from './PredictionErrorFrame'
import { PredictionErrorProperty } from './PredictionErrorProperty'
import { PredictionFrame } from './PredictionFrame'
import { clone } from './clone'

const EPS = 0.0001

const closeEnough = (value: number, EPSILON: number) => {
    return value < EPSILON && value > -EPSILON
}

class Predictor {
    predictionFrames: Map<number, PredictionFrame>
    latestTick: number

    constructor() {
        this.predictionFrames = new Map()
        this.latestTick = -1
    }

    cleanUp(tick: number) {
        this.predictionFrames.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.predictionFrames.delete(predictionFrame.tick)
            }
        })
    }

    addCustom(tick: number, entity: any, props: string[], nschema: Schema) {
        let predictionFrame = this.predictionFrames.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.predictionFrames.set(tick, predictionFrame)
        }
        const proxy = Object.assign({}, entity)
        predictionFrame.add(entity.nid, proxy, props, nschema)
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
        const predictionErrorFrame = new PredictionErrorFrame(frame.clientTick)
        if (frame) {
            // predictions for this frame
            const predictionFrame = this.predictionFrames.get(frame.clientTick)

            if (predictionFrame) {
                predictionFrame.entityPredictions.forEach(entityPrediction => {
                    // predictions for this entity
                    const nid = entityPrediction.nid
                    const authoritative = frame.entities.get(nid)
                    if (authoritative) {
                        entityPrediction.props.forEach(prop => {
                            const authValue = authoritative![prop]
                            const predValue = entityPrediction.proxy[prop]
                            const diff = authValue - predValue

                            if (!closeEnough(diff, EPS)) {
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
        this.latestTick = frame.clientTick
        return predictionErrorFrame
    }
}

export { Predictor }