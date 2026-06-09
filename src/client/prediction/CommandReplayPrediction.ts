import { Client } from '../Client'
import { PredictionOperationKind } from './PredictionLog'
import type { PredictionOperation, PredictionOperationOptions } from './PredictionLog'

export type CommandReplayCorrection<TState = any> = {
    corrected: boolean
    error: number
    replayed: number
    state: TState
}

export type CommandReplayPredictionOptions<TLocal = any, TAuthority = any, TState = any, TCommand = any> = {
    client: Client
    nid: number | (() => number | null | undefined)
    getLocal: () => TLocal | undefined
    getAuthoritative: () => TAuthority | undefined
    createReplayState?: (authority: TAuthority) => TState
    applyCommand: (state: TLocal | TState, command: TCommand) => void
    applyReplayState?: (local: TLocal, replayState: TState) => void
    measureError?: (local: TLocal, replayState: TState) => number
    shouldCorrect?: (error: number, context: { local: TLocal, replayState: TState, authoritative: TAuthority }) => boolean
    affectedProps?: string[]
    predictionOptions?: Omit<PredictionOperationOptions, 'affected' | 'applyLocal'>
}

function defaultReplayState<TState>(authority: any): TState {
    return Object.assign({}, authority)
}

function defaultApplyReplayState(local: any, replayState: any) {
    Object.assign(local, replayState)
}

function defaultMeasureError(local: any, replayState: any) {
    if (
        typeof local?.x === 'number' &&
        typeof local?.y === 'number' &&
        typeof replayState?.x === 'number' &&
        typeof replayState?.y === 'number'
    ) {
        return Math.hypot(replayState.x - local.x, replayState.y - local.y)
    }
    return JSON.stringify(local) === JSON.stringify(replayState) ? 0 : Number.POSITIVE_INFINITY
}

function defaultShouldCorrect(error: number) {
    return error > 0.001
}

/**
 * Small movement-style helper over PredictionLog. It predicts commands
 * immediately, then rebuilds local state from latest authority plus still
 * unconfirmed commands when the server confirms a client tick.
 */
export class CommandReplayPrediction<TLocal = any, TAuthority = any, TState = any, TCommand = any> {
    private client: Client
    private nid: number | (() => number | null | undefined)
    private getLocal: () => TLocal | undefined
    private getAuthoritative: () => TAuthority | undefined
    private createReplayState: (authority: TAuthority) => TState
    private applyCommand: (state: TLocal | TState, command: TCommand) => void
    private applyReplayState: (local: TLocal, replayState: TState) => void
    private measureError: (local: TLocal, replayState: TState) => number
    private shouldCorrect: (error: number, context: { local: TLocal, replayState: TState, authoritative: TAuthority }) => boolean
    private affectedProps?: string[]
    private predictionOptions?: Omit<PredictionOperationOptions, 'affected' | 'applyLocal'>

    constructor(options: CommandReplayPredictionOptions<TLocal, TAuthority, TState, TCommand>) {
        this.client = options.client
        this.nid = options.nid
        this.getLocal = options.getLocal
        this.getAuthoritative = options.getAuthoritative
        this.createReplayState = options.createReplayState || defaultReplayState
        this.applyCommand = options.applyCommand
        this.applyReplayState = options.applyReplayState || defaultApplyReplayState
        this.measureError = options.measureError || defaultMeasureError
        this.shouldCorrect = options.shouldCorrect || defaultShouldCorrect
        this.affectedProps = options.affectedProps
        this.predictionOptions = options.predictionOptions
    }

    predict(command: TCommand): PredictionOperation | undefined {
        const nid = this.resolveNid()
        const local = this.getLocal()
        if (nid === undefined || !local) {
            return undefined
        }

        return this.client.predictCommand(command, {
            ...this.predictionOptions,
            affected: [{ nid, props: this.affectedProps }],
            applyLocal: () => {
                this.applyCommand(local, command)
            }
        })
    }

    reconcile(): CommandReplayCorrection<TState> | null {
        const nid = this.resolveNid()
        const local = this.getLocal()
        const authoritative = this.getAuthoritative()
        if (nid === undefined || !local || !authoritative) {
            return null
        }

        const replayState = this.createReplayState(authoritative)
        const pending = this.getPendingCommands()
        for (let i = 0; i < pending.length; i++) {
            this.applyCommand(replayState, pending[i].payload as TCommand)
        }

        const error = this.measureError(local, replayState)
        const corrected = this.shouldCorrect(error, { local, replayState, authoritative })
        if (corrected) {
            this.applyReplayState(local, replayState)
        }
        return {
            corrected,
            error,
            replayed: pending.length,
            state: replayState
        }
    }

    getPendingCommands() {
        const nid = this.resolveNid()
        if (nid === undefined) {
            return []
        }
        return this.client.predictor.log.getPendingByNid(nid)
            .filter(operation => operation.kind === PredictionOperationKind.Command)
            .sort((a, b) => a.clientTick - b.clientTick || a.id - b.id)
    }

    private resolveNid() {
        const nid = typeof this.nid === 'function' ? this.nid() : this.nid
        return typeof nid === 'number' ? nid : undefined
    }
}
