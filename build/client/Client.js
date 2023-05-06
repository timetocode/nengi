"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const ClientNetwork_1 = require("./ClientNetwork");
class Client {
    constructor(context, adapterCtor, serverTickRate) {
        this.context = context;
        this.network = new ClientNetwork_1.ClientNetwork(this);
        this.adapter = new adapterCtor(this.network);
        this.serverTickRate = serverTickRate;
        this.disconnectHandler = (reason, event) => {
            console.log('Disconnected!', reason, event);
        };
        this.websocketErrorHandler = (event) => {
            console.log('Websocket Error', event);
        };
    }
    connect(wsUrl, handshake) {
        return this.adapter.connect(wsUrl, handshake);
    }
    setDisconnectHandler(handler) {
        this.disconnectHandler = handler;
    }
    setWebsocketErrorHandler(handler) {
        this.websocketErrorHandler = handler;
    }
    flush() {
        this.adapter.flush();
    }
    addCommand(command) {
        this.network.addCommand(command);
    }
}
exports.Client = Client;
//# sourceMappingURL=Client.js.map