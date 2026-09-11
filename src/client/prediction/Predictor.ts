
import { Frame } from '../Frame'
import { EntityStore } from '../EntityStore'
import { PredictionLog, PredictionOperationStatus, targetsOverlap } from './PredictionLog'
import type { PredictionOperation, PredictionOperationOptions, PredictionResolution, PredictionTarget } from './PredictionLog'

export type PredictionStateMismatch = {
    operation: PredictionOperation
    nid: number
    prop: string
    expected: any
    authoritative: any
}

export type PredictionReconciliationEvent = {
    frame: Frame
    confirmedCommandFrameNumber: number
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

class Predictor {
    log: PredictionLog
    private reconciliationHandlers: Set<PredictionReconciliationHandler>

    constructor() {
        this.log = new PredictionLog()
        this.reconciliationHandlers = new Set()
    }

    cleanUp(commandFrameNumber: number) {
        this.log.pruneResolvedBefore(commandFrameNumber - 50)
    }

    addCommand(command: any, commandFrameNumber: number, options: PredictionOperationOptions = {}) {
        return this.log.addCommand(command, commandFrameNumber, options)
    }

    addState(payload: any, commandFrameNumber: number, options: PredictionOperationOptions = {}) {
        return this.log.addState(payload, commandFrameNumber, options)
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
        commandFrameNumber: number,
        options: PredictionOperationOptions<Response> = {}
    ) {
        return this.log.addRequest(requestId, endpointId, payload, commandFrameNumber, options)
    }

    resolveRequest<Response = any>(requestId: number, response: Response, frame?: Frame, store?: EntityStore) {
        return this.log.resolveRequest(requestId, response, frame, store)
    }

    rejectRequest(requestId: number, error: any, frame?: Frame, store?: EntityStore) {
        return this.log.rejectRequest(requestId, error, frame, store)
    }

    resolveFrame(frame: Frame, store: EntityStore) {
        const resolutions = this.log.confirmCommandFrameNumber(frame.confirmedCommandFrameNumber, frame, store)
        this.emitReconciliations(frame, store, resolutions)
        return resolutions
    }

    private emitReconciliations(frame: Frame, store: EntityStore, resolutions: PredictionResolution[]) {
        if (this.reconciliationHandlers.size === 0 || resolutions.length === 0) {
            return
        }

        // One event per entity: a later expectation supersedes the same property
        // even when its affected-property group differs from an earlier one.
        const byTarget = new Map<number, { target: PredictionTarget, confirmed: PredictionOperation[] }>()
        for (let i = 0; i < resolutions.length; i++) {
            const operation = resolutions[i].operation
            for (let j = 0; j < operation.affected.length; j++) {
                const target = operation.affected[j]
                let entry = byTarget.get(target.nid)
                if (!entry) {
                    entry = { target: { nid: target.nid, props: target.props?.slice() }, confirmed: [] }
                    byTarget.set(target.nid, entry)
                } else if (!target.props) {
                    entry.target.props = undefined
                } else if (entry.target.props) {
                    for (const prop of target.props) {
                        if (!entry.target.props.includes(prop)) entry.target.props.push(prop)
                    }
                }
                if (entry.confirmed[entry.confirmed.length - 1] !== operation) entry.confirmed.push(operation)
            }
        }

        byTarget.forEach(entry => {
            const authority = store.get(entry.target.nid)
            const pending = this.log.getPendingByTarget(entry.target)
            const mismatches = this.collectMismatches(entry.confirmed, entry.target, authority)
            const event: PredictionReconciliationEvent = {
                frame,
                confirmedCommandFrameNumber: frame.confirmedCommandFrameNumber,
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
        const sorted = operations.slice().sort((a, b) => a.commandFrameNumber - b.commandFrameNumber || a.id - b.id)
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
