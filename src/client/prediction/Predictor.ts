
import { Schema } from '../../common/binary/schema/Schema'
import { Frame } from '../Frame'
import { PredictionErrorFrame } from './PredictionErrorFrame'
import { PredictionErrorProperty } from './PredictionErrorProperty'
import { PredictionFrame } from './PredictionFrame'
import { clone } from './clone'
import { EntityStore } from '../EntityStore'
import { PredictionLog, PredictionOperationStatus } from './PredictionLog'
import type { PredictionOperation, PredictionOperationOptions, PredictionResolution, PredictionTarget } from './PredictionLog'

const EPS = 0.0001

const closeEnough = (value: number, EPSILON: number) => {
    return value < EPSILON && value > -EPSILON
}

export type PredictionStateMismatch = {
    operation: PredictionOperation
    nid: number
    prop: string
    expected: any
    authoritative: any
}

export type PredictionReconciliationEvent = {
    frame: Frame
    confirmedClientTick: number
    store: EntityStore
    target: PredictionTarget
    authority: any
    confirmed: PredictionOperation[]
    pending: PredictionOperation[]
    mismatches: PredictionStateMismatch[]
    dropConfirmed: () => void
    dropPending: () => void
}

type PredictionReconciliationHandler = (event: PredictionReconciliationEvent) => void

function targetKey(target: PredictionTarget) {
    return `${target.nid}:${target.props ? target.props.slice().sort().join(',') : '*'}`
}

function targetsOverlap(a: PredictionTarget, b: PredictionTarget) {
    if (a.nid !== b.nid) {
        return false
    }
    if (!a.props || !b.props) {
        return true
    }
    for (let i = 0; i < a.props.length; i++) {
        if (b.props.indexOf(a.props[i]) > -1) {
            return true
        }
    }
    return false
}

class Predictor {
    predictionFrames: Map<number, PredictionFrame>
    log: PredictionLog
    latestTick: number
    private reconciliationHandlers: Set<PredictionReconciliationHandler>

    constructor() {
        this.predictionFrames = new Map()
        this.log = new PredictionLog()
        this.latestTick = -1
        this.reconciliationHandlers = new Set()
    }

    cleanUp(tick: number) {
        this.predictionFrames.forEach(predictionFrame => {
            if (predictionFrame.tick < tick - 50) {
                this.predictionFrames.delete(predictionFrame.tick)
            }
        })
        this.log.pruneResolvedBefore(tick - 50)
    }

    addCommand(command: any, tick: number, options: PredictionOperationOptions = {}) {
        return this.log.addCommand(command, tick, options)
    }

    addState(payload: any, tick: number, options: PredictionOperationOptions = {}) {
        return this.log.addState(payload, tick, options)
    }

    onReconcile(handler: PredictionReconciliationHandler) {
        this.reconciliationHandlers.add(handler)
        return () => {
            this.reconciliationHandlers.delete(handler)
        }
    }

    addRequest<Response = any>(
        requestId: number,
        endpointId: number,
        payload: any,
        tick: number,
        options: PredictionOperationOptions<Response> = {}
    ) {
        return this.log.addRequest(requestId, endpointId, payload, tick, options)
    }

    resolveRequest<Response = any>(requestId: number, response: Response, frame?: Frame, store?: EntityStore) {
        return this.log.resolveRequest(requestId, response, frame, store)
    }

    rejectRequest(requestId: number, error: any, frame?: Frame, store?: EntityStore) {
        return this.log.rejectRequest(requestId, error, frame, store)
    }

    resolveFrame(frame: Frame, store: EntityStore) {
        const resolutions = this.log.confirmTick(frame.confirmedClientTick, frame, store)
        this.emitReconciliations(frame, store, resolutions)
        return resolutions
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

    getErrors(frame: Frame, entities: Map<number, any>) {
        const predictionErrorFrame = new PredictionErrorFrame(frame.confirmedClientTick)
        if (frame) {
            // predictions for this frame
            const predictionFrame = this.predictionFrames.get(frame.confirmedClientTick)

            if (predictionFrame) {
                predictionFrame.entityPredictions.forEach(entityPrediction => {
                    // predictions for this entity
                    const nid = entityPrediction.nid
                    const authoritative = entities.get(nid)
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
        this.latestTick = frame.confirmedClientTick
        return predictionErrorFrame
    }

    private emitReconciliations(frame: Frame, store: EntityStore, resolutions: PredictionResolution[]) {
        if (this.reconciliationHandlers.size === 0 || resolutions.length === 0) {
            return
        }

        const byTarget = new Map<string, { target: PredictionTarget, confirmed: PredictionOperation[] }>()
        for (let i = 0; i < resolutions.length; i++) {
            const operation = resolutions[i].operation
            for (let j = 0; j < operation.affected.length; j++) {
                const target = operation.affected[j]
                const key = targetKey(target)
                let entry = byTarget.get(key)
                if (!entry) {
                    entry = { target, confirmed: [] }
                    byTarget.set(key, entry)
                }
                entry.confirmed.push(operation)
            }
        }

        byTarget.forEach(entry => {
            const authority = store.get(entry.target.nid)
            const pending = this.log.getPendingByTarget(entry.target)
            const mismatches = this.collectMismatches(entry.confirmed, entry.target, authority)
            const event: PredictionReconciliationEvent = {
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
                        this.log.discard(entry.confirmed[i])
                    }
                },
                dropPending: () => {
                    this.log.discardWhere(operation => operation.status === PredictionOperationStatus.Pending &&
                        operation.affected.some(target => targetsOverlap(target, entry.target)))
                }
            }
            this.reconciliationHandlers.forEach(handler => handler(event))
        })
    }

    private collectMismatches(operations: PredictionOperation[], target: PredictionTarget, authority: any) {
        const mismatches: PredictionStateMismatch[] = []
        if (!authority) {
            return mismatches
        }
        const latestExpected = new Map<string, { operation: PredictionOperation, value: any }>()
        const sorted = operations.slice().sort((a, b) => a.clientTick - b.clientTick || a.id - b.id)
        for (let i = 0; i < sorted.length; i++) {
            const operation = sorted[i]
            const expected = operation.options.expected || []
            for (let j = 0; j < expected.length; j++) {
                if (expected[j].nid !== target.nid) {
                    continue
                }
                const props = Object.keys(expected[j].values)
                for (let k = 0; k < props.length; k++) {
                    const prop = props[k]
                    if (target.props && target.props.indexOf(prop) === -1) {
                        continue
                    }
                    latestExpected.set(prop, { operation, value: expected[j].values[prop] })
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
                })
            }
        })
        return mismatches
    }
}

export { Predictor }
export { PredictionLog, PredictionOperationKind, PredictionOperationStatus } from './PredictionLog'
export type { PredictionOperationOptions, PredictionTarget } from './PredictionLog'
