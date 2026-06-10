import { EntityStore } from '../EntityStore';
import { Frame } from '../Frame';
export declare enum PredictionOperationKind {
    Command = "command",
    Request = "request",
    State = "state"
}
export declare enum PredictionOperationStatus {
    Pending = "pending",
    Confirmed = "confirmed",
    Rejected = "rejected"
}
export type PredictionTarget = {
    nid: number;
    props?: string[];
};
export type PredictionExpectedState = {
    nid: number;
    values: Record<string, any>;
};
export type PredictionContext<Response = any> = {
    operation: PredictionOperation<Response>;
    frame?: Frame;
    store?: EntityStore;
    response?: Response;
    error?: any;
};
export type PredictionValidation<Response = any> = boolean | {
    accepted: boolean;
    reason?: any;
    data?: any;
};
export type PredictionOperationOptions<Response = any> = {
    affected?: PredictionTarget[];
    expected?: PredictionExpectedState[];
    applyLocal?: (context: PredictionContext<Response>) => void;
    validate?: (context: PredictionContext<Response>) => PredictionValidation<Response>;
    reconcile?: (context: PredictionContext<Response> & {
        accepted: boolean;
        reason?: any;
        data?: any;
    }) => void;
};
export type PredictionResolution<Response = any> = {
    operation: PredictionOperation<Response>;
    accepted: boolean;
    reason?: any;
    data?: any;
    response?: Response;
    error?: any;
};
export type PredictionOperation<Response = any> = {
    id: number;
    kind: PredictionOperationKind;
    clientTick: number;
    payload: any;
    affected: PredictionTarget[];
    status: PredictionOperationStatus;
    requestId?: number;
    endpointId?: number;
    options: PredictionOperationOptions<Response>;
};
export declare class PredictionLog {
    nextId: number;
    operations: Map<number, PredictionOperation<any>>;
    byTick: Map<number, PredictionOperation<any>[]>;
    byRequestId: Map<number, PredictionOperation<any>>;
    resolutions: PredictionResolution[];
    addCommand(command: any, clientTick: number, options?: PredictionOperationOptions): PredictionOperation<any>;
    addState(payload: any, clientTick: number, options?: PredictionOperationOptions): PredictionOperation<any>;
    addRequest<Response = any>(requestId: number, endpointId: number, payload: any, clientTick: number, options?: PredictionOperationOptions<Response>): PredictionOperation<Response>;
    confirmTick(confirmedClientTick: number, frame?: Frame, store?: EntityStore): PredictionResolution<any>[];
    resolveRequest<Response = any>(requestId: number, response: Response, frame?: Frame, store?: EntityStore): PredictionResolution<Response> | undefined;
    rejectRequest(requestId: number, error: any, frame?: Frame, store?: EntityStore): PredictionResolution<any> | undefined;
    getPendingOperations(): PredictionOperation<any>[];
    getPendingCommands(): PredictionOperation<any>[];
    getPendingRequests(): PredictionOperation<any>[];
    getPendingByNid(nid: number): PredictionOperation<any>[];
    getPendingByTarget(target: PredictionTarget): PredictionOperation<any>[];
    discard(operation: PredictionOperation): void;
    discardWhere(predicate: (operation: PredictionOperation) => boolean): void;
    pruneResolvedBefore(clientTick: number): void;
    private createOperation;
    private addToTick;
    private applyLocal;
    private resolve;
    private deleteOperation;
}
//# sourceMappingURL=PredictionLog.d.ts.map