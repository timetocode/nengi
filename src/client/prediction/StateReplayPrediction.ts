import { Client } from '../Client'
import { PredictionOperationKind, targetsOverlap } from './PredictionLog'
import type { PredictionOperation, PredictionOperationOptions } from './PredictionLog'
import type { PredictionReconciliationEvent } from './Predictor'

export type StateReplayCorrection<TState = any> = {
    replayed: number
    state: TState
    mismatches: number
}

export type StateReplayPredictionOptions<TLocal = any, TAuthority = any, TState = any, TPayload = any> = {
    client: Client
    nid: number | (() => number | null | undefined)
    getLocal: () => TLocal | undefined
    getAuthoritative?: () => TAuthority | undefined
    createReplayState?: (authority: TAuthority) => TState
    applyPayload: (state: TLocal | TState, payload: TPayload) => void
    applyReplayState?: (local: TLocal, replayState: TState) => void
    affectedProps?: string[]
    /** Computes the expected result from the pre-step state, on prediction and replay.
     * Return independent values for mutable properties. */
    expectedValues?: (state: TLocal | TState, payload: TPayload) => Record<string, any> | undefined
    predictionOptions?: Omit<PredictionOperationOptions, 'affected' | 'expected' | 'applyLocal'>
    dropConfirmedOnReconcile?: boolean
}

function defaultReplayState<TState>(authority: any): TState {
    return Object.assign({}, authority)
}

function defaultApplyReplayState(local: any, replayState: any) {
    Object.assign(local, replayState)
}

/**
 * State-change replay helper over PredictionLog. It predicts a local state
 * payload immediately, then rebuilds local state from latest authority plus
 * still-unconfirmed state payloads when the server confirms a command frame number.
 */
export class StateReplayPrediction<TLocal = any, TAuthority = any, TState = any, TPayload = any> {
    private client: Client
    private nid: number | (() => number | null | undefined)
    private getLocal: () => TLocal | undefined
    private getAuthoritative?: () => TAuthority | undefined
    private createReplayState: (authority: TAuthority) => TState
    private applyPayload: (state: TLocal | TState, payload: TPayload) => void
    private applyReplayState: (local: TLocal, replayState: TState) => void
    private affectedProps?: string[]
    private expectedValues?: (state: TLocal | TState, payload: TPayload) => Record<string, any> | undefined
    private predictionOptions?: Omit<PredictionOperationOptions, 'affected' | 'expected' | 'applyLocal'>
    private dropConfirmedOnReconcile: boolean

    constructor(options: StateReplayPredictionOptions<TLocal, TAuthority, TState, TPayload>) {
        this.client = options.client
        this.nid = options.nid
        this.getLocal = options.getLocal
        this.getAuthoritative = options.getAuthoritative
        this.createReplayState = options.createReplayState || defaultReplayState
        this.applyPayload = options.applyPayload
        this.applyReplayState = options.applyReplayState || defaultApplyReplayState
        this.affectedProps = options.affectedProps
        this.expectedValues = options.expectedValues
        this.predictionOptions = options.predictionOptions
        this.dropConfirmedOnReconcile = options.dropConfirmedOnReconcile ?? true
    }

    predict(payload: TPayload, expectedValues?: Record<string, any>): PredictionOperation | undefined {
        const nid = this.resolveNid()
        const local = this.getLocal()
        if (nid === undefined || !local) {
            return undefined
        }

        const values = expectedValues ?? this.expectedValues?.(local, payload)
        return this.client.predictState(payload, {
            ...this.predictionOptions,
            affected: [{ nid, props: this.affectedProps }],
            expected: values ? [{ nid, values: { ...values } }] : undefined,
            applyLocal: () => {
                this.applyPayload(local, payload)
            }
        })
    }

    reconcile(event?: PredictionReconciliationEvent): StateReplayCorrection<TState> | null {
        const nid = this.resolveNid()
        const local = this.getLocal()
        if (nid === undefined || !local) {
            return null
        }
        if (event && !targetsOverlap(event.target, { nid, props: this.affectedProps })) {
            return null
        }
        const authoritative = (event?.authority ?? this.getAuthoritative?.() ?? this.getAuthoritativeFromStore(nid)) as TAuthority | undefined
        if (!authoritative) {
            return null
        }

        const replayState = this.createReplayState(authoritative)
        const pending = this.getPendingStateOperations(event)
        for (let i = 0; i < pending.length; i++) {
            const operation = pending[i]
            const values = this.expectedValues?.(replayState, operation.payload as TPayload)
            // Capture before the next replay step can mutate a reused result map.
            const expected = values ? { ...values } : undefined
            this.applyPayload(replayState, operation.payload as TPayload)
            if (expected) {
                operation.options.expected = [{ nid, values: expected }]
            } else {
                // Explicit predictions name the properties to recapture. Inputs
                // remain unchanged; only their derived expected result changes.
                operation.options.expected = operation.options.expected?.map(entry => {
                    if (entry.nid !== nid) return entry
                    const values: Record<string, any> = {}
                    const authority = this.client.network.store.get(nid)
                    const schema = authority && this.client.context.getSchema(authority.ntype)
                    for (const prop of Object.keys(entry.values)) {
                        const value = (replayState as any)[prop]
                        values[prop] = schema?.props[prop]?.binary.clone(value) ?? value
                    }
                    return { nid, values }
                })
            }
        }
        this.applyReplayState(local, replayState)
        if (event && this.dropConfirmedOnReconcile) {
            event.dropConfirmed()
        }
        return {
            replayed: pending.length,
            state: replayState,
            mismatches: event?.mismatches.length ?? 0
        }
    }

    getPendingStateOperations(event?: PredictionReconciliationEvent) {
        const nid = this.resolveNid()
        if (nid === undefined) {
            return []
        }
        const target = { nid, props: this.affectedProps }
        if (event && !targetsOverlap(event.target, target)) {
            return []
        }
        // An event may cover only part of this helper's state. Rebuilding that
        // state still needs every pending operation that affects the helper.
        return this.client.predictor.log.getPendingByTarget(target)
            .filter(operation => operation.kind === PredictionOperationKind.State)
            .sort((a, b) => a.commandFrameNumber - b.commandFrameNumber || a.id - b.id)
    }

    private resolveNid() {
        const nid = typeof this.nid === 'function' ? this.nid() : this.nid
        return typeof nid === 'number' ? nid : undefined
    }

    private getAuthoritativeFromStore(nid: number) {
        return this.client.network.store.get(nid) as TAuthority | undefined
    }
}
