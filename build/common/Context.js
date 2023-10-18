"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Context = void 0;
const connectAttemptSchema_1 = require("./schemas/connectAttemptSchema");
const EngineMessage_1 = require("./EngineMessage");
const connectionAcceptedSchema_1 = require("./schemas/connectionAcceptedSchema");
const connectionDeniedSchema_1 = require("./schemas/connectionDeniedSchema");
const connectionTerminatedSchema_1 = require("./schemas/connectionTerminatedSchema");
const clientTickSchema_1 = require("./schemas/clientTickSchema");
const timeSyncSchema_1 = require("./schemas/timeSyncSchema");
const pingSchema_1 = require("./schemas/pingSchema");
const pongSchema_1 = require("./schemas/pongSchema");
class Context {
    constructor() {
        /**
         * user-defined network schemas
         */
        this.schemas = {};
        /**
         * schemas internal to nengi
         */
        this.engineSchemas = {};
        // setup the engine schemas
        this.registerEngineSchema(EngineMessage_1.EngineMessage.ConnectionAttempt, connectAttemptSchema_1.connectionAttemptSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.ConnectionAccepted, connectionAcceptedSchema_1.connectionAcceptedSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.ConnectionDenied, connectionDeniedSchema_1.connectionDeniedSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.ConnectionTerminated, connectionTerminatedSchema_1.connectionTerminatedSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.ClientTick, clientTickSchema_1.clientTickSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.TimeSync, timeSyncSchema_1.timeSyncSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.Ping, pingSchema_1.pingSchema);
        this.registerEngineSchema(EngineMessage_1.EngineMessage.Pong, pongSchema_1.pongSchema);
    }
    register(ntype, schema) {
        this.schemas[ntype] = schema;
    }
    registerEngineSchema(engineMessageType, schema) {
        this.engineSchemas[engineMessageType] = schema;
    }
    getSchema(ntype) {
        return this.schemas[ntype];
    }
    getEngineSchema(ntype) {
        return this.engineSchemas[ntype];
    }
}
exports.Context = Context;
