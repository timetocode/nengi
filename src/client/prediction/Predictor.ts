import { IEntity } from '../../common/IEntity'
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

type tick = number
type nid = number

class Predicto2r {
    predictions: Map<nid, Map<string, { value: any, tick: number }>> = new Map()

    addCustom(tick: number, entity: IEntity, props: string[]) {
        return this.add(tick, entity, props)
    }
    addDiscrete(tick: number, entity: IEntity, props: string[]) {
        return this.add(tick, entity, props)
    }
    addOblivious(tick: number, entity: IEntity, props: string[]) {
        return this.add(tick, entity, props)
    }

    cleanUp(tick: number) {

    }

    add(tick: number, entity: IEntity, props: string[]) {
        if (!this.predictions.has(entity.nid)) {
            this.predictions.set(entity.nid, new Map())
        }
        const propertyPredictions = this.predictions.get(entity.nid)!
        props.forEach(prop => {
            if (propertyPredictions.has(prop)) {
                propertyPredictions.get(prop)!.value = entity[prop]
                propertyPredictions.get(prop)!.tick = tick
            } else {
                propertyPredictions.set(prop, { value: entity[prop], tick })
            }
        })
    }

    isPredicted(nid: number, prop: string, tick: number) {
        if (!this.predictions.has(nid)) {
            return false
        }

        const predictedEntities: Map<string, { value: any, tick: number }> = this.predictions.get(nid)!
        if (!predictedEntities.has(prop)) {
            return false
        }

        const predictedProperties: { value: any, tick: number } = predictedEntities.get(prop)!
        if (predictedProperties.tick === tick) {
            return true
        }
    }

    getErrors(frame: Frame) {
        const confirmedTick = frame.confirmedClientTick
        const predictionErrorFrame = new PredictionErrorFrame(confirmedTick)

        this.predictions.forEach((predictedEntity: Map<string, { value: any, tick: number }>, nid: nid) => {
            const auth = frame.entities.get(nid)
            predictedEntity.forEach((predictedProperty: { value: any, tick: number }, prop: string) => {
                if (predictedProperty.tick === confirmedTick) {
                    const authValue = auth![prop]
                    const predValue = predictedProperty.value
                    if (!areCloseBits(authValue, predValue, 12)) {
                        predictionErrorFrame.add(
                            nid,
                            auth,
                            new PredictionErrorProperty(nid, prop, predValue, authValue)
                        )
                    }
                }
            })
        })

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

        return predictionErrorFrame
    }
}


type OngoingPrediction = {
    nid: number,
    properties: {
        [prop: string]: {
            value: any,
            tick: number
        }
    }
}

type TickRange = { start: tick, end: tick }
type DualState = { auth: any, pred: any }
type PropTickRanges = Map<prop, TickRange>
type PropDualStates = Map<prop, DualState>
type prop = string

class Predictor {
    latestTick: number = -1

    // per entity, tracks the tick range that a given property is being predicted
    predictionRange: Map<nid, PropTickRanges> = new Map()
    continuous: Map<tick, PredictionFrame> = new Map()
    discrete: Map<tick, PredictionFrame> = new Map()
    detached: Map<tick, PredictionFrame> = new Map()
    // used for detatched predictions, stores the authoritative and predicted states of an entity
    multiState: Map<nid, PropDualStates> = new Map()

    isPredicted(nid: number, prop: string, tick: number) {
        if (this.predictionRange.has(nid)) {
            const propertyPredictionRanges = this.predictionRange.get(nid)!
            if (propertyPredictionRanges.has(prop)) {
                const range = propertyPredictionRanges.get(prop)!
                if (tick >= range.start && tick <= range.end) {
                    return true
                }
            }
        }
        return false
    }

    addDetached(tick: number, entity: IEntity, props: string[]) {
        if (!this.multiState.has(entity.nid)) {
            this.multiState.set(entity.nid, new Map())
        }

        const multiProps = this.multiState.get(entity.nid)!

        props.forEach(prop => {
            if (!multiProps.has(prop)) {
                multiProps.set(prop, { auth: entity[prop], pred: entity[prop] })
            } else {
                const multiProp = multiProps.get(prop)!
                multiProp.pred = entity[prop]
            }
        })

        let predictionFrame = this.detached.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.detached.set(tick, predictionFrame)
        }
        const proxy = Object.assign({}, entity)
        predictionFrame.add(entity.nid, proxy, props)

        this.createOrUpdatePredictionRange(tick, entity, props)
    }

    createOrUpdatePredictionRange(tick: number, entity: IEntity, props: string[]) {
        if (!this.predictionRange.has(entity.nid)) {
            this.predictionRange.set(entity.nid, new Map())
        }
        const predictionRangeProps = this.predictionRange.get(entity.nid)!
        props.forEach(prop => {
            if (!predictionRangeProps.has(prop)) {
                predictionRangeProps.set(prop, { start: tick, end: tick })
            } else {
                predictionRangeProps.get(prop)!.end = tick
            }
        })
    }

    addDiscrete(tick: number, entity: IEntity, props: string[]) {
        let predictionFrame = this.discrete.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.discrete.set(tick, predictionFrame)
        }
        const proxy = Object.assign({}, entity)
        predictionFrame.add(entity.nid, proxy, props)

        this.createOrUpdatePredictionRange(tick, entity, props)
    }

    addCustom(tick: number, entity: any, props: string[]) {
        let predictionFrame = this.continuous.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.continuous.set(tick, predictionFrame)
        }
        const proxy = Object.assign({}, entity)
        predictionFrame.add(entity.nid, proxy, props)

        this.createOrUpdatePredictionRange(tick, entity, props)
    }

    // deprecated
    add(tick: number, entity: any, props: string[], nschema: Schema) {
        let predictionFrame = this.continuous.get(tick)
        if (!predictionFrame) {
            predictionFrame = new PredictionFrame(tick)
            this.continuous.set(tick, predictionFrame)
        }
        const proxy = clone(entity, nschema)
        predictionFrame.add(entity.nid, proxy, props)
    }

    has(tick: number, nid: number, prop: string) {
        const predictionFrame = this.continuous.get(tick)
        if (predictionFrame) {
            const entityPrediction = predictionFrame.entityPredictions.get(nid)
            if (entityPrediction) {
                return entityPrediction.props.indexOf(prop) !== -1
            }
        }
        return false
    }

    // returns authoritative and the final predicted state for entities that 
    // have finished their detached predictions; the authoritative state conitnues
    // to change every frame if new network data comes through for it
    // and the intended usage is to allow the game logic to interp between the last
    // predicted position and true authoritative position (which might be the same, in
    // an ideal scenario, but also the auth position can continue to change)
    getMultistate() {
        const out: { nid: nid, prop: prop, auth: any, pred: any }[] = []
        this.multiState.forEach((propDualStates: PropDualStates, nid: nid) => {
            propDualStates.forEach((state: DualState, prop: prop) => {
                // only include those who are not being actively predicted
                if (!this.isPredicted(nid, prop, this.latestTick)) {
                    out.push({ nid, prop, auth: state.auth, pred: state.pred })
                }
            })
        })
        return out
    }

    getErrors(frame: Frame) {
        const confirmedTick = frame.confirmedClientTick
        const predictionErrorFrame = new PredictionErrorFrame(confirmedTick)
        if (frame) {

            this.multiState.forEach((propDualStates: PropDualStates, nid: nid) => {
                if (frame.entities.has(nid)) {
                    const authEntity = frame.entities.get(nid)!
                    propDualStates.forEach((state: DualState, prop: prop) => {
                        state.auth = authEntity[prop]
                    })
                }
            })

            // we dont reconcile or consider desync for detached predictions
            this.detached.forEach((predictionFrame: PredictionFrame, clientTick: number) => {
                if (predictionFrame.tick > confirmedTick) {

                }
            })
            // TODO we still need to delete these^ eventually as well as multiState entitries

            // for discrete predictions, the server has often processed numerous frames from the client
            // and confirms only the last frame, so we need to dig back through the predictions to find any
            // that would've been encompassed within this range (anything before confirmedTick) and then
            // reconcile it if there is a desync
            this.discrete.forEach((predictionFrame: PredictionFrame, clientTick: number) => {
                if (clientTick <= confirmedTick) {
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
                    // we can delete the discrete prediction now, it only gets touched once
                    this.discrete.delete(clientTick)
                }
            })

            // continuous predictions are often made every frame, but we only care about the most recent state
            // which will be in the latest confirmedTick, anything before this can be discarded
            const predictionFrame = this.continuous.get(confirmedTick)

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

            this.continuous.forEach((predictionFrame: PredictionFrame, clientTick: number) => {
                if (clientTick <= confirmedTick) {
                    // delete anything old
                    this.continuous.delete(clientTick)
                }
            })


        }
        this.latestTick = frame.confirmedClientTick
        return predictionErrorFrame
    }

    cleanUp(tick: number) {
        return
        // trying to handle clean up within getErrors instead;
        // does this make sense? do we do this here or at the time we have finished reading the data 
        this.continuous.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.continuous.delete(predictionFrame.tick)
            }
        })
    }
}

export { Predictor }