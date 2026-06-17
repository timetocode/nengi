"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandReplayPrediction = void 0;
const PredictionLog_1 = require("./PredictionLog");
function defaultReplayState(authority) {
    return Object.assign({}, authority);
}
function defaultApplyReplayState(local, replayState) {
    Object.assign(local, replayState);
}
function defaultMeasureError(local, replayState) {
    if (typeof (local === null || local === void 0 ? void 0 : local.x) === 'number' &&
        typeof (local === null || local === void 0 ? void 0 : local.y) === 'number' &&
        typeof (replayState === null || replayState === void 0 ? void 0 : replayState.x) === 'number' &&
        typeof (replayState === null || replayState === void 0 ? void 0 : replayState.y) === 'number') {
        return Math.hypot(replayState.x - local.x, replayState.y - local.y);
    }
    return JSON.stringify(local) === JSON.stringify(replayState) ? 0 : Number.POSITIVE_INFINITY;
}
function defaultShouldCorrect(error) {
    return error > 0.001;
}
/**
 * Small movement-style helper over PredictionLog. It predicts commands
 * immediately, then rebuilds local state from latest authority plus still
 * unconfirmed commands when the server confirms a client tick.
 */
class CommandReplayPrediction {
    constructor(options) {
        this.client = options.client;
        this.nid = options.nid;
        this.getLocal = options.getLocal;
        this.getAuthoritative = options.getAuthoritative;
        this.createReplayState = options.createReplayState || defaultReplayState;
        this.applyCommand = options.applyCommand;
        this.applyReplayState = options.applyReplayState || defaultApplyReplayState;
        this.measureError = options.measureError || defaultMeasureError;
        this.shouldCorrect = options.shouldCorrect || defaultShouldCorrect;
        this.affectedProps = options.affectedProps;
        this.predictionOptions = options.predictionOptions;
        this.timingOptions = options.timingOptions;
    }
    predict(command) {
        const nid = this.resolveNid();
        const local = this.getLocal();
        if (nid === undefined || !local) {
            return undefined;
        }
        const predictionOptions = Object.assign(Object.assign({}, this.predictionOptions), { affected: [{ nid, props: this.affectedProps }], applyLocal: () => {
                this.applyCommand(local, command);
            } });
        if (this.timingOptions) {
            const timingOptions = typeof this.timingOptions === 'function'
                ? this.timingOptions(command)
                : this.timingOptions;
            return this.client.predictCommandWithTiming(command, predictionOptions, timingOptions);
        }
        return this.client.predictCommand(command, predictionOptions);
    }
    reconcile() {
        var _a, _b;
        const nid = this.resolveNid();
        const local = this.getLocal();
        if (nid === undefined || !local) {
            return null;
        }
        const authoritative = (_b = (_a = this.getAuthoritative) === null || _a === void 0 ? void 0 : _a.call(this)) !== null && _b !== void 0 ? _b : this.getAuthoritativeFromStore(nid);
        if (!authoritative) {
            return null;
        }
        const replayState = this.createReplayState(authoritative);
        const pending = this.getPendingCommands();
        for (let i = 0; i < pending.length; i++) {
            this.applyCommand(replayState, pending[i].payload);
        }
        const error = this.measureError(local, replayState);
        const corrected = this.shouldCorrect(error, { local, replayState, authoritative });
        if (corrected) {
            this.applyReplayState(local, replayState);
        }
        return {
            corrected,
            error,
            replayed: pending.length,
            state: replayState
        };
    }
    getPendingCommands() {
        const nid = this.resolveNid();
        if (nid === undefined) {
            return [];
        }
        return this.client.predictor.log.getPendingByNid(nid)
            .filter(operation => operation.kind === PredictionLog_1.PredictionOperationKind.Command)
            .sort((a, b) => a.clientTick - b.clientTick || a.id - b.id);
    }
    resolveNid() {
        const nid = typeof this.nid === 'function' ? this.nid() : this.nid;
        return typeof nid === 'number' ? nid : undefined;
    }
    getAuthoritativeFromStore(nid) {
        return this.client.network.store.get(nid);
    }
}
exports.CommandReplayPrediction = CommandReplayPrediction;
