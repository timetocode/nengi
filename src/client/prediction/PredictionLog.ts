import { EntityStore } from '../EntityStore'
import { Frame } from '../Frame'

export enum PredictionOperationKind {
    Command = 'command',
    Request = 'request',
    State = 'state'
}

export enum PredictionOperationStatus {
    Pending = 'pending',
    Confirmed = 'confirmed',
    Rejected = 'rejected'
}

export type PredictionTarget = {
    nid: number
    props?: string[]
}

export type PredictionExpectedState = {
    nid: number
    values: Record<string, any>
}

export type PredictionContext<Response = any> = {
    operation: PredictionOperation<Response>
    frame?: Frame
    store?: EntityStore
    response?: Response
    error?: any
}

export type PredictionValidation<Response = any> =
    | boolean
    | {
        accepted: boolean
        reason?: any
        data?: any
    }

export type PredictionOperationOptions<Response = any> = {
    affected?: PredictionTarget[]
    expected?: PredictionExpectedState[]
    applyLocal?: (context: PredictionContext<Response>) => void
    validate?: (context: PredictionContext<Response>) => PredictionValidation<Response>
    reconcile?: (context: PredictionContext<Response> & { accepted: boolean, reason?: any, data?: any }) => void
}

export type PredictionResolution<Response = any> = {
    operation: PredictionOperation<Response>
    accepted: boolean
    reason?: any
    data?: any
    response?: Response
    error?: any
}

export type PredictionOperation<Response = any> = {
    id: number
    kind: PredictionOperationKind
    commandFrameNumber: number
    payload: any
    affected: PredictionTarget[]
    status: PredictionOperationStatus
    requestId?: number
    endpointId?: number
    options: PredictionOperationOptions<Response>
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

export class PredictionLog {
    nextId = 1
    operations = new Map<number, PredictionOperation>()
    byCommandFrameNumber = new Map<number, PredictionOperation[]>()
    byRequestId = new Map<number, PredictionOperation>()
    resolutions: PredictionResolution[] = []

    addCommand(command: any, commandFrameNumber: number, options: PredictionOperationOptions = {}) {
        const operation = this.createOperation(PredictionOperationKind.Command, commandFrameNumber, command, options)
        this.addToCommandFrameNumber(operation)
        this.applyLocal(operation)
        return operation
    }

    addState(payload: any, commandFrameNumber: number, options: PredictionOperationOptions = {}) {
        const operation = this.createOperation(PredictionOperationKind.State, commandFrameNumber, payload, options)
        this.addToCommandFrameNumber(operation)
        this.applyLocal(operation)
        return operation
    }

    addRequest<Response = any>(
        requestId: number,
        endpointId: number,
        payload: any,
        commandFrameNumber: number,
        options: PredictionOperationOptions<Response> = {}
    ) {
        const operation = this.createOperation<Response>(PredictionOperationKind.Request, commandFrameNumber, payload, options)
        operation.requestId = requestId
        operation.endpointId = endpointId
        this.byRequestId.set(requestId, operation)
        this.addToCommandFrameNumber(operation)
        this.applyLocal(operation)
        return operation
    }

    confirmCommandFrameNumber(confirmedCommandFrameNumber: number, frame?: Frame, store?: EntityStore) {
        const resolutions: PredictionResolution[] = []
        this.operations.forEach(operation => {
            if (
                operation.status === PredictionOperationStatus.Pending &&
                (operation.kind === PredictionOperationKind.Command || operation.kind === PredictionOperationKind.State) &&
                operation.commandFrameNumber <= confirmedCommandFrameNumber
            ) {
                resolutions.push(this.resolve(operation, { frame, store }))
            }
        })
        return resolutions
    }

    resolveRequest<Response = any>(requestId: number, response: Response, frame?: Frame, store?: EntityStore) {
        const operation = this.byRequestId.get(requestId) as PredictionOperation<Response> | undefined
        if (!operation || operation.status !== PredictionOperationStatus.Pending) {
            return undefined
        }
        return this.resolve(operation, { frame, store, response })
    }

    rejectRequest(requestId: number, error: any, frame?: Frame, store?: EntityStore) {
        const operation = this.byRequestId.get(requestId)
        if (!operation || operation.status !== PredictionOperationStatus.Pending) {
            return undefined
        }
        return this.resolve(operation, { frame, store, error, forceRejected: true })
    }

    getPendingOperations() {
        return Array.from(this.operations.values()).filter(operation => operation.status === PredictionOperationStatus.Pending)
    }

    getPendingCommands() {
        return this.getPendingOperations().filter(operation => operation.kind === PredictionOperationKind.Command)
    }

    getPendingRequests() {
        return this.getPendingOperations().filter(operation => operation.kind === PredictionOperationKind.Request)
    }

    getPendingByNid(nid: number) {
        return this.getPendingOperations().filter(operation => {
            return operation.affected.some(target => target.nid === nid)
        })
    }

    getPendingByTarget(target: PredictionTarget) {
        return this.getPendingOperations().filter(operation => {
            return operation.affected.some(affected => targetsOverlap(affected, target))
        })
    }

    discard(operation: PredictionOperation) {
        this.deleteOperation(operation)
    }

    discardWhere(predicate: (operation: PredictionOperation) => boolean) {
        this.operations.forEach(operation => {
            if (predicate(operation)) {
                this.deleteOperation(operation)
            }
        })
    }

    pruneResolvedBefore(commandFrameNumber: number) {
        this.operations.forEach(operation => {
            if (operation.status !== PredictionOperationStatus.Pending && operation.commandFrameNumber < commandFrameNumber) {
                this.deleteOperation(operation)
            }
        })
        this.resolutions = this.resolutions.filter(resolution => resolution.operation.commandFrameNumber >= commandFrameNumber)
    }

    private createOperation<Response>(
        kind: PredictionOperationKind,
        commandFrameNumber: number,
        payload: any,
        options: PredictionOperationOptions<Response>
    ): PredictionOperation<Response> {
        const operation: PredictionOperation<Response> = {
            id: this.nextId++,
            kind,
            commandFrameNumber,
            payload,
            affected: options.affected || [],
            status: PredictionOperationStatus.Pending,
            options
        }
        this.operations.set(operation.id, operation)
        return operation
    }

    private addToCommandFrameNumber(operation: PredictionOperation) {
        const operations = this.byCommandFrameNumber.get(operation.commandFrameNumber) || []
        operations.push(operation)
        this.byCommandFrameNumber.set(operation.commandFrameNumber, operations)
    }

    private applyLocal(operation: PredictionOperation) {
        if (operation.options.applyLocal) {
            operation.options.applyLocal({ operation })
        }
    }

    private resolve<Response>(
        operation: PredictionOperation<Response>,
        context: {
            frame?: Frame
            store?: EntityStore
            response?: Response
            error?: any
            forceRejected?: boolean
        }
    ) {
        let accepted = !context.forceRejected
        let reason = context.error
        let data: any
        if (accepted && operation.options.validate) {
            const validation = operation.options.validate({
                operation,
                frame: context.frame,
                store: context.store,
                response: context.response,
                error: context.error
            })
            if (typeof validation === 'boolean') {
                accepted = validation
            } else {
                accepted = validation.accepted
                reason = validation.reason
                data = validation.data
            }
        }

        operation.status = accepted ? PredictionOperationStatus.Confirmed : PredictionOperationStatus.Rejected
        const resolution: PredictionResolution<Response> = {
            operation,
            accepted,
            reason,
            data,
            response: context.response,
            error: context.error
        }
        this.resolutions.push(resolution)
        if (operation.options.reconcile) {
            operation.options.reconcile({
                operation,
                frame: context.frame,
                store: context.store,
                response: context.response,
                error: context.error,
                accepted,
                reason,
                data
            })
        }
        if (operation.requestId !== undefined) {
            this.byRequestId.delete(operation.requestId)
        }
        return resolution
    }

    private deleteOperation(operation: PredictionOperation) {
        this.operations.delete(operation.id)
        if (operation.requestId !== undefined) {
            this.byRequestId.delete(operation.requestId)
        }
        const frameOperations = this.byCommandFrameNumber.get(operation.commandFrameNumber)
        if (frameOperations) {
            const index = frameOperations.indexOf(operation)
            if (index > -1) {
                frameOperations.splice(index, 1)
            }
            if (frameOperations.length === 0) {
                this.byCommandFrameNumber.delete(operation.commandFrameNumber)
            }
        }
    }
}
