import { Client } from '../Client'
import { PredictionOperationKind } from './PredictionLog'
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
    expectedValues?: (local: TLocal, payload: TPayload) => Record<string, any> | undefined
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
 * still-unconfirmed state payloads when the server confirms a client tick.
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
    private expectedValues?: (local: TLocal, payload: TPayload) => Record<string, any> | undefined
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
            expected: values ? [{ nid, values }] : undefined,
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
        const authoritative = (event?.authority ?? this.getAuthoritative?.() ?? this.getAuthoritativeFromStore(nid)) as TAuthority | undefined
        if (!authoritative) {
            return null
        }
        if (event && event.target.nid !== nid) {
            return null
        }

        const replayState = this.createReplayState(authoritative)
        const pending = this.getPendingStateOperations(event)
        for (let i = 0; i < pending.length; i++) {
            this.applyPayload(replayState, pending[i].payload as TPayload)
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
        const operations = event ? event.pending : this.getPendingByNid()
        return operations
            .filter(operation => operation.kind === PredictionOperationKind.State)
            .sort((a, b) => a.clientTick - b.clientTick || a.id - b.id)
    }

    private getPendingByNid() {
        const nid = this.resolveNid()
        if (nid === undefined) {
            return []
        }
        return this.client.predictor.log.getPendingByNid(nid)
    }

    private resolveNid() {
        const nid = typeof this.nid === 'function' ? this.nid() : this.nid
        return typeof nid === 'number' ? nid : undefined
    }

    private getAuthoritativeFromStore(nid: number) {
        return this.client.network.store.get(nid) as TAuthority | undefined
    }
}
