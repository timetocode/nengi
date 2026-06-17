"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateReplayPrediction = void 0;
const PredictionLog_1 = require("./PredictionLog");
function defaultReplayState(authority) {
    return Object.assign({}, authority);
}
function defaultApplyReplayState(local, replayState) {
    Object.assign(local, replayState);
}
/**
 * State-change replay helper over PredictionLog. It predicts a local state
 * payload immediately, then rebuilds local state from latest authority plus
 * still-unconfirmed state payloads when the server confirms a client tick.
 */
class StateReplayPrediction {
    constructor(options) {
        var _a;
        this.client = options.client;
        this.nid = options.nid;
        this.getLocal = options.getLocal;
        this.getAuthoritative = options.getAuthoritative;
        this.createReplayState = options.createReplayState || defaultReplayState;
        this.applyPayload = options.applyPayload;
        this.applyReplayState = options.applyReplayState || defaultApplyReplayState;
        this.affectedProps = options.affectedProps;
        this.expectedValues = options.expectedValues;
        this.predictionOptions = options.predictionOptions;
        this.dropConfirmedOnReconcile = (_a = options.dropConfirmedOnReconcile) !== null && _a !== void 0 ? _a : true;
    }
    predict(payload, expectedValues) {
        var _a;
        const nid = this.resolveNid();
        const local = this.getLocal();
        if (nid === undefined || !local) {
            return undefined;
        }
        const values = expectedValues !== null && expectedValues !== void 0 ? expectedValues : (_a = this.expectedValues) === null || _a === void 0 ? void 0 : _a.call(this, local, payload);
        return this.client.predictState(payload, Object.assign(Object.assign({}, this.predictionOptions), { affected: [{ nid, props: this.affectedProps }], expected: values ? [{ nid, values }] : undefined, applyLocal: () => {
                this.applyPayload(local, payload);
            } }));
    }
    reconcile(event) {
        var _a, _b, _c, _d;
        const nid = this.resolveNid();
        const local = this.getLocal();
        if (nid === undefined || !local) {
            return null;
        }
        const authoritative = ((_c = (_a = event === null || event === void 0 ? void 0 : event.authority) !== null && _a !== void 0 ? _a : (_b = this.getAuthoritative) === null || _b === void 0 ? void 0 : _b.call(this)) !== null && _c !== void 0 ? _c : this.getAuthoritativeFromStore(nid));
        if (!authoritative) {
            return null;
        }
        if (event && event.target.nid !== nid) {
            return null;
        }
        const replayState = this.createReplayState(authoritative);
        const pending = this.getPendingStateOperations(event);
        for (let i = 0; i < pending.length; i++) {
            this.applyPayload(replayState, pending[i].payload);
        }
        this.applyReplayState(local, replayState);
        if (event && this.dropConfirmedOnReconcile) {
            event.dropConfirmed();
        }
        return {
            replayed: pending.length,
            state: replayState,
            mismatches: (_d = event === null || event === void 0 ? void 0 : event.mismatches.length) !== null && _d !== void 0 ? _d : 0
        };
    }
    getPendingStateOperations(event) {
        const operations = event ? event.pending : this.getPendingByNid();
        return operations
            .filter(operation => operation.kind === PredictionLog_1.PredictionOperationKind.State)
            .sort((a, b) => a.clientTick - b.clientTick || a.id - b.id);
    }
    getPendingByNid() {
        const nid = this.resolveNid();
        if (nid === undefined) {
            return [];
        }
        return this.client.predictor.log.getPendingByNid(nid);
    }
    resolveNid() {
        const nid = typeof this.nid === 'function' ? this.nid() : this.nid;
        return typeof nid === 'number' ? nid : undefined;
    }
    getAuthoritativeFromStore(nid) {
        return this.client.network.store.get(nid);
    }
}
exports.StateReplayPrediction = StateReplayPrediction;
