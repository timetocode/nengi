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
class Context {
    constructor() {
        this.schemas = new Map();
        this.engineSchemas = new Map();
        // setup the engine schemas
        this.engineSchemas.set(EngineMessage_1.EngineMessage.ConnectionAttempt, connectAttemptSchema_1.connectionAttemptSchema);
        this.engineSchemas.set(EngineMessage_1.EngineMessage.ConnectionAccepted, connectionAcceptedSchema_1.connectionAcceptedSchema);
        this.engineSchemas.set(EngineMessage_1.EngineMessage.ConnectionDenied, connectionDeniedSchema_1.connectionDeniedSchema);
        this.engineSchemas.set(EngineMessage_1.EngineMessage.ConnectionTerminated, connectionTerminatedSchema_1.connectionTerminatedSchema);
        this.engineSchemas.set(EngineMessage_1.EngineMessage.ClientTick, clientTickSchema_1.clientTickSchema);
        this.engineSchemas.set(EngineMessage_1.EngineMessage.TimeSync, timeSyncSchema_1.timeSyncSchema);
    }
    register(ntype, schema) {
        this.schemas.set(ntype, schema);
    }
    getSchema(ntype) {
        return this.schemas.get(ntype);
    }
    getEngineSchema(ntype) {
        return this.engineSchemas.get(ntype);
    }
}
exports.Context = Context;
//# sourceMappingURL=Context.js.map