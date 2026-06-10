"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockServerSocket = exports.MockClientSocket = exports.MockClientAdapter = exports.MockInstanceAdapter = exports.LocalClientAdapter = exports.LocalInstanceAdapter = void 0;
const User_1 = require("../User");
const NQueue_1 = require("../../NQueue");
/**
 * Dependency-free in-memory transport.
 * Useful for single-player modes, embedded simulations, and tests where a real
 * socket would add environment-specific noise without changing nengi behavior.
 */
class LocalInstanceAdapter {
    constructor(network, config) {
        this.network = network;
        this.serverSockets = [];
        if (!(config === null || config === void 0 ? void 0 : config.binary)) {
            throw new Error('LocalInstanceAdapter requires a config.binary to be created.');
        }
        this.binary = config.binary;
    }
    listen(options, ready) {
        var _a;
        ready === null || ready === void 0 ? void 0 : ready();
        (_a = options === null || options === void 0 ? void 0 : options.ready) === null || _a === void 0 ? void 0 : _a.call(options);
    }
    createMockConnect() {
        const socket = new MockServerSocket(this.network);
        this.open(socket);
        return socket;
    }
    open(socket) {
        const user = new User_1.User(socket, this);
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
        user.socket.end(reason);
    }
    send(user, buffer) {
        user.socket.send(buffer, true);
    }
}
exports.LocalInstanceAdapter = LocalInstanceAdapter;
class LocalClientAdapter {
    constructor(network, config) {
        this.socket = null;
        this.connected = false;
        this.pendingConnect = null;
        this.network = network;
        if (!(config === null || config === void 0 ? void 0 : config.binary)) {
            throw new Error('LocalClientAdapter requires a config.binary to be created.');
        }
        this.binary = config.binary;
    }
    onMessage(buffer) {
        var _a, _b;
        if (!this.connected) {
            const result = this.network.readHandshakeResponse(this.binary.createReader(buffer));
            if (result.accepted) {
                this.connected = true;
                (_a = this.pendingConnect) === null || _a === void 0 ? void 0 : _a.resolve(result);
            }
            else {
                (_b = this.pendingConnect) === null || _b === void 0 ? void 0 : _b.reject(result.reason);
            }
            this.pendingConnect = null;
            return;
        }
        const br = this.binary.createReader(buffer);
        this.network.readSnapshot(br);
    }
    connect(target, handshake) {
        this.socket = target || null;
        if (!this.socket) {
            this.connected = true;
            return Promise.resolve({ accepted: true });
        }
        this.socket.adapter = this;
        return new Promise((resolve, reject) => {
            this.pendingConnect = { resolve, reject };
            this.socket.send(this.network.createHandshake(handshake, this.binary));
        });
    }
    flush() {
        if (!this.socket) {
            return;
        }
        if (!this.connected) {
            return;
        }
        this.socket.send(this.network.createOutbound(this.binary));
    }
    disconnect(reason) {
        var _a;
        (_a = this.socket) === null || _a === void 0 ? void 0 : _a.close(reason);
        this.socket = null;
        this.connected = false;
    }
}
exports.LocalClientAdapter = LocalClientAdapter;
var MockSocketReadyState;
(function (MockSocketReadyState) {
    MockSocketReadyState[MockSocketReadyState["CONNECTING"] = 0] = "CONNECTING";
    MockSocketReadyState[MockSocketReadyState["OPEN"] = 1] = "OPEN";
    MockSocketReadyState[MockSocketReadyState["CLOSING"] = 2] = "CLOSING";
    MockSocketReadyState[MockSocketReadyState["CLOSED"] = 3] = "CLOSED";
})(MockSocketReadyState || (MockSocketReadyState = {}));
class MockServerSocket {
    constructor(network) {
        this.inboundQueue = new NQueue_1.NQueue();
        this.readyState = MockSocketReadyState.CONNECTING;
        this.clientSocket = new MockClientSocket(this);
        this.user = null;
        this.network = network;
        this.readyState = MockSocketReadyState.OPEN;
    }
    end(reason) {
        this.readyState = MockSocketReadyState.CLOSED;
        this.clientSocket.close(reason);
    }
    receive(buffer) {
        //this.inboundQueue.enqueue(buffer)
        this.network.onMessage(this.user, buffer);
    }
    send(buffer) {
        if (this.clientSocket) {
            this.clientSocket.receive(buffer);
        }
    }
}
exports.MockServerSocket = MockServerSocket;
class MockClientSocket {
    constructor(serverSocket) {
        this.adapter = null;
        this.inboundQueue = new NQueue_1.NQueue();
        this.readyState = MockSocketReadyState.CONNECTING;
        this.serverSocket = serverSocket;
        this.readyState = MockSocketReadyState.OPEN;
    }
    close(reason) {
        this.readyState = MockSocketReadyState.CLOSED;
        if (this.serverSocket.user) {
            this.serverSocket.network.onClose(this.serverSocket.user);
        }
    }
    send(buffer) {
        this.serverSocket.receive(buffer);
    }
    receive(buffer) {
        if (this.adapter) {
            this.adapter.onMessage(buffer);
            return;
        }
        this.inboundQueue.enqueue(buffer);
    }
}
exports.MockClientSocket = MockClientSocket;
const MockInstanceAdapter = LocalInstanceAdapter;
exports.MockInstanceAdapter = MockInstanceAdapter;
const MockClientAdapter = LocalClientAdapter;
exports.MockClientAdapter = MockClientAdapter;
