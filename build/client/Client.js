"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const ClientNetwork_1 = require("./ClientNetwork");
const Predictor_1 = require("./prediction/Predictor");
class Client {
    constructor(context, adapterCtor, serverTickRate, adapterConfig) {
        this.context = context;
        this.network = new ClientNetwork_1.ClientNetwork(this);
        this.adapter = new adapterCtor(this.network, adapterConfig);
        this.serverTickRate = serverTickRate;
        this.predictor = new Predictor_1.Predictor();
        this.disconnectHandler = (reason, event) => {
            console.log('Disconnected!', reason, event);
        };
        this.websocketErrorHandler = (event) => {
            console.log('Websocket Error', event);
        };
    }
    connect(target, handshake) {
        return this.adapter.connect(target, handshake);
    }
    disconnect(reason) {
        var _a, _b;
        (_b = (_a = this.adapter).disconnect) === null || _b === void 0 ? void 0 : _b.call(_a, reason);
    }
    setDisconnectHandler(handler) {
        this.disconnectHandler = handler;
    }
    setWebsocketErrorHandler(handler) {
        this.websocketErrorHandler = handler;
    }
    flush() {
        this.adapter.flush();
        this.network.flush();
    }
    addCommand(command) {
        this.network.addCommand(command);
    }
    /**
     * Sends a command with optional input/view timing metadata for server-side
     * lag compensation. Use ordinary addCommand when the server does not need
     * to know what the client was viewing when the input was authored.
     */
    addCommandWithTiming(command, options = {}) {
        this.network.addCommandWithTiming(command, options);
    }
    reportInterpolationDelay(delayMs, options = {}) {
        return this.network.reportInterpolationDelay(delayMs, options);
    }
    predictCommand(command, options = {}) {
        return this.network.predictCommand(command, options);
    }
    /**
     * Predicts locally and sends the command with timing metadata. This is the
     * command-replay path for movement, shooting, dodging, and similar actions
     * where reconciliation and lag compensation both matter.
     */
    predictCommandWithTiming(command, predictionOptions = {}, timingOptions = {}) {
        return this.network.predictCommandWithTiming(command, predictionOptions, timingOptions);
    }
    predictState(payload, options = {}) {
        return this.network.predictState(payload, options);
    }
    request(endpoint, payload, callbackOrOptions) {
        return this.network.request(endpoint, payload, callbackOrOptions);
    }
}
exports.Client = Client;
