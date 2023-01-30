"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAdapter = void 0;
const User_1 = require("../User");
/**
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
class MockAdapter {
    constructor(network, config) {
        this.network = network;
        this.serverSockets = [];
    }
    listen(port, ready) {
        console.log('MockAdapter listen is fake! No need to invoke it.');
    }
    createMockConnect() {
        /// TODO
    }
    open(socket) {
        const user = new User_1.User(socket);
        socket.user = user;
        this.network.onOpen(user);
    }
    message(socket, message) {
        if (socket.user) {
            // this.network.onBinaryMessage(socket.user, message)
        }
    }
    close(socket) {
        if (socket.user) {
            this.network.onClose(socket.user);
        }
    }
    disconnect(user, reason) {
        user.socket.end(1000, JSON.stringify(reason));
    }
    send(user, buffer) {
        user.socket.send(buffer, true);
    }
}
exports.MockAdapter = MockAdapter;
var MockSocketReadyState;
(function (MockSocketReadyState) {
    MockSocketReadyState[MockSocketReadyState["CONNECTING"] = 0] = "CONNECTING";
    MockSocketReadyState[MockSocketReadyState["OPEN"] = 1] = "OPEN";
    MockSocketReadyState[MockSocketReadyState["CLOSING"] = 2] = "CLOSING";
    MockSocketReadyState[MockSocketReadyState["CLOSED"] = 3] = "CLOSED";
})(MockSocketReadyState || (MockSocketReadyState = {}));
class MockServerSocket {
    constructor(clientSocket, user, network) {
        this.readyState = MockSocketReadyState.CONNECTING;
        this.clientSocket = clientSocket;
        this.user = user;
        this.network = network;
        this.readyState = MockSocketReadyState.OPEN;
    }
    end() {
    }
    receive(buffer) {
        //this.network.onBinaryMessage(this.user, buffer)
    }
    send(buffer) {
        if (this.clientSocket) {
        }
    }
}
class MockClientSocket {
    constructor(serverSocket) {
        this.readyState = MockSocketReadyState.CONNECTING;
        this.serverSocket = serverSocket;
        this.readyState = MockSocketReadyState.OPEN;
    }
    close() {
        this.readyState = MockSocketReadyState.CLOSED;
    }
    send(buffer) {
        this.serverSocket.receive(buffer);
    }
    receive(buffer) {
    }
}
