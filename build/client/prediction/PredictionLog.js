"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PredictionLog = exports.PredictionOperationStatus = exports.PredictionOperationKind = void 0;
var PredictionOperationKind;
(function (PredictionOperationKind) {
    PredictionOperationKind["Command"] = "command";
    PredictionOperationKind["Request"] = "request";
    PredictionOperationKind["State"] = "state";
})(PredictionOperationKind || (exports.PredictionOperationKind = PredictionOperationKind = {}));
var PredictionOperationStatus;
(function (PredictionOperationStatus) {
    PredictionOperationStatus["Pending"] = "pending";
    PredictionOperationStatus["Confirmed"] = "confirmed";
    PredictionOperationStatus["Rejected"] = "rejected";
})(PredictionOperationStatus || (exports.PredictionOperationStatus = PredictionOperationStatus = {}));
function targetsOverlap(a, b) {
    if (a.nid !== b.nid) {
        return false;
    }
    if (!a.props || !b.props) {
        return true;
    }
    for (let i = 0; i < a.props.length; i++) {
        if (b.props.indexOf(a.props[i]) > -1) {
            return true;
        }
    }
    return false;
}
class PredictionLog {
    constructor() {
        this.nextId = 1;
        this.operations = new Map();
        this.byTick = new Map();
        this.byRequestId = new Map();
        this.resolutions = [];
    }
    addCommand(command, clientTick, options = {}) {
        const operation = this.createOperation(PredictionOperationKind.Command, clientTick, command, options);
        this.addToTick(operation);
        this.applyLocal(operation);
        return operation;
    }
    addState(payload, clientTick, options = {}) {
        const operation = this.createOperation(PredictionOperationKind.State, clientTick, payload, options);
        this.addToTick(operation);
        this.applyLocal(operation);
        return operation;
    }
    addRequest(requestId, endpointId, payload, clientTick, options = {}) {
        const operation = this.createOperation(PredictionOperationKind.Request, clientTick, payload, options);
        operation.requestId = requestId;
        operation.endpointId = endpointId;
        this.byRequestId.set(requestId, operation);
        this.addToTick(operation);
        this.applyLocal(operation);
        return operation;
    }
    confirmTick(confirmedClientTick, frame, store) {
        const resolutions = [];
        this.operations.forEach(operation => {
            if (operation.status === PredictionOperationStatus.Pending &&
                (operation.kind === PredictionOperationKind.Command || operation.kind === PredictionOperationKind.State) &&
                operation.clientTick <= confirmedClientTick) {
                resolutions.push(this.resolve(operation, { frame, store }));
            }
        });
        return resolutions;
    }
    resolveRequest(requestId, response, frame, store) {
        const operation = this.byRequestId.get(requestId);
        if (!operation || operation.status !== PredictionOperationStatus.Pending) {
            return undefined;
        }
        return this.resolve(operation, { frame, store, response });
    }
    rejectRequest(requestId, error, frame, store) {
        const operation = this.byRequestId.get(requestId);
        if (!operation || operation.status !== PredictionOperationStatus.Pending) {
            return undefined;
        }
        return this.resolve(operation, { frame, store, error, forceRejected: true });
    }
    getPendingOperations() {
        return Array.from(this.operations.values()).filter(operation => operation.status === PredictionOperationStatus.Pending);
    }
    getPendingCommands() {
        return this.getPendingOperations().filter(operation => operation.kind === PredictionOperationKind.Command);
    }
    getPendingRequests() {
        return this.getPendingOperations().filter(operation => operation.kind === PredictionOperationKind.Request);
    }
    getPendingByNid(nid) {
        return this.getPendingOperations().filter(operation => {
            return operation.affected.some(target => target.nid === nid);
        });
    }
    getPendingByTarget(target) {
        return this.getPendingOperations().filter(operation => {
            return operation.affected.some(affected => targetsOverlap(affected, target));
        });
    }
    discard(operation) {
        this.deleteOperation(operation);
    }
    discardWhere(predicate) {
        this.operations.forEach(operation => {
            if (predicate(operation)) {
                this.deleteOperation(operation);
            }
        });
    }
    pruneResolvedBefore(clientTick) {
        this.operations.forEach(operation => {
            if (operation.status !== PredictionOperationStatus.Pending && operation.clientTick < clientTick) {
                this.deleteOperation(operation);
            }
        });
        this.resolutions = this.resolutions.filter(resolution => resolution.operation.clientTick >= clientTick);
    }
    createOperation(kind, clientTick, payload, options) {
        const operation = {
            id: this.nextId++,
            kind,
            clientTick,
            payload,
            affected: options.affected || [],
            status: PredictionOperationStatus.Pending,
            options
        };
        this.operations.set(operation.id, operation);
        return operation;
    }
    addToTick(operation) {
        const operations = this.byTick.get(operation.clientTick) || [];
        operations.push(operation);
        this.byTick.set(operation.clientTick, operations);
    }
    applyLocal(operation) {
        if (operation.options.applyLocal) {
            operation.options.applyLocal({ operation });
        }
    }
    resolve(operation, context) {
        let accepted = !context.forceRejected;
        let reason = context.error;
        let data;
        if (accepted && operation.options.validate) {
            const validation = operation.options.validate({
                operation,
                frame: context.frame,
                store: context.store,
                response: context.response,
                error: context.error
            });
            if (typeof validation === 'boolean') {
                accepted = validation;
            }
            else {
                accepted = validation.accepted;
                reason = validation.reason;
                data = validation.data;
            }
        }
        operation.status = accepted ? PredictionOperationStatus.Confirmed : PredictionOperationStatus.Rejected;
        const resolution = {
            operation,
            accepted,
            reason,
            data,
            response: context.response,
            error: context.error
        };
        this.resolutions.push(resolution);
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
            });
        }
        if (operation.requestId !== undefined) {
            this.byRequestId.delete(operation.requestId);
        }
        return resolution;
    }
    deleteOperation(operation) {
        this.operations.delete(operation.id);
        if (operation.requestId !== undefined) {
            this.byRequestId.delete(operation.requestId);
        }
        const tickOperations = this.byTick.get(operation.clientTick);
        if (tickOperations) {
            const index = tickOperations.indexOf(operation);
            if (index > -1) {
                tickOperations.splice(index, 1);
            }
            if (tickOperations.length === 0) {
                this.byTick.delete(operation.clientTick);
            }
        }
    }
}
exports.PredictionLog = PredictionLog;
