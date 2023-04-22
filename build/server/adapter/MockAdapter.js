"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockServerSocket = exports.MockClientSocket = exports.MockClientAdapter = exports.MockInstanceAdapter = void 0;
const User_1 = require("../User");
const NQueue_1 = __importDefault(require("../../NQueue"));
/**
 * Not a real network adapter, data is passed without using a real socket.
 * Used for mixing a server and client together in one application
 * such as for a single player mode or automated testing
 */
class MockInstanceAdapter {
    constructor(network, config) {
        this.network = network;
        this.serverSockets = [];
        if (!config || !config.bufferCtor || !config.binaryWriterCtor) {
            throw new Error('MockAdapter requires a config.bufferCtor and config.binaryWriterCtor to be created.');
        }
        this.bufferCtor = config.bufferCtor;
        this.binaryWriterCtor = config.binaryWriterCtor;
        this.binaryReaderCtor = config.binaryReaderCtor;
    }
    listen(port, ready) {
        console.log('MockAdapter listen is fake! No need to invoke it.');
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
        user.socket.end(1000, JSON.stringify(reason));
    }
    send(user, buffer) {
        user.socket.send(buffer, true);
    }
    createBuffer(lengthInBytes) {
        return new this.bufferCtor(lengthInBytes);
    }
    createBufferWriter(lengthInBytes) {
        return new this.binaryWriterCtor(this.createBuffer(lengthInBytes));
    }
    createBufferReader(buffer) {
        return new this.binaryReaderCtor(buffer);
    }
}
exports.MockInstanceAdapter = MockInstanceAdapter;
class MockClientAdapter {
    constructor(network, config) {
        this.network = network;
        this.bufferCtor = config.bufferCtor;
        this.binaryWriterCtor = config.binaryWriterCtor;
        this.binaryReaderCtor = config.binaryReaderCtor;
    }
    createBuffer(lengthInBytes) {
        return new this.bufferCtor(lengthInBytes);
    }
    createBufferWriter(lengthInBytes) {
        return new this.binaryWriterCtor(this.createBuffer(lengthInBytes));
    }
    createBufferReader(buffer) {
        return new this.binaryReaderCtor(buffer);
    }
    onMessage(buffer) {
        const br = this.createBufferReader(buffer);
        this.network.readSnapshot(br);
    }
    connect(wsUrl, handshake) {
        return new Promise((resolve, reject) => {
            resolve(true);
        });
    }
    flush() {
    }
}
exports.MockClientAdapter = MockClientAdapter;
var MockSocketReadyState;
(function (MockSocketReadyState) {
    MockSocketReadyState[MockSocketReadyState["CONNECTING"] = 0] = "CONNECTING";
    MockSocketReadyState[MockSocketReadyState["OPEN"] = 1] = "OPEN";
    MockSocketReadyState[MockSocketReadyState["CLOSING"] = 2] = "CLOSING";
    MockSocketReadyState[MockSocketReadyState["CLOSED"] = 3] = "CLOSED";
})(MockSocketReadyState || (MockSocketReadyState = {}));
class MockServerSocket {
    constructor(network) {
        this.inboundQueue = new NQueue_1.default();
        this.readyState = MockSocketReadyState.CONNECTING;
        this.clientSocket = new MockClientSocket(this);
        this.user = null;
        this.network = network;
        this.readyState = MockSocketReadyState.OPEN;
    }
    end() {
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
        this.inboundQueue = new NQueue_1.default();
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
        this.inboundQueue.enqueue(buffer);
    }
}
exports.MockClientSocket = MockClientSocket;
//# sourceMappingURL=MockAdapter.js.map