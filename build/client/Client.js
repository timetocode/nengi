"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const ClientNetwork_1 = require("./ClientNetwork");
class Client {
    constructor(context, adapterCtor) {
        this.context = context;
        this.network = new ClientNetwork_1.ClientNetwork(this);
        this.adapter = new adapterCtor(this.network);
    }
    connect(wsUrl, handshake) {
        return this.adapter.connect(wsUrl, handshake);
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