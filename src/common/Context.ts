import { connectionAttemptSchema } from './schemas/connectAttemptSchema'
import { EngineMessage } from './EngineMessage'
import { Schema } from './binary/schema/Schema'
import { connectionAcceptedSchema } from './schemas/connectionAcceptedSchema'
import { connectionDeniedSchema } from './schemas/connectionDeniedSchema'
import { connectionTerminatedSchema } from './schemas/connectionTerminatedSchema'
import { clientTickSchema } from './schemas/clientTickSchema'
import { timeSyncSchema } from './schemas/timeSyncSchema'
import { pingSchema } from './schemas/pingSchema'
import { pongSchema } from './schemas/pongSchema'

export class Context {
    /**
     * user-defined network schemas
     */
    schemas: { [prop: number]: Schema } = {}

    /**
     * schemas internal to nengi
     */
    engineSchemas: { [prop: number]: Schema } = {}

    constructor() {
        // setup the engine schemas
        this.registerEngineSchema(EngineMessage.ConnectionAttempt, connectionAttemptSchema)
        this.registerEngineSchema(EngineMessage.ConnectionAccepted, connectionAcceptedSchema)
        this.registerEngineSchema(EngineMessage.ConnectionDenied, connectionDeniedSchema)
        this.registerEngineSchema(EngineMessage.ConnectionTerminated, connectionTerminatedSchema)
        this.registerEngineSchema(EngineMessage.ClientTick, clientTickSchema)
        this.registerEngineSchema(EngineMessage.TimeSync, timeSyncSchema)
        this.registerEngineSchema(EngineMessage.Ping, pingSchema)
        this.registerEngineSchema(EngineMessage.Pong, pongSchema)
    }

    register(ntype: number, schema: Schema) {
        this.schemas[ntype] = schema
    }

    registerEngineSchema(engineMessageType: number, schema: Schema) {
        this.engineSchemas[engineMessageType] = schema
    }

    getSchema(ntype: number) {
        return this.schemas[ntype]
    }

    getEngineSchema(ntype: number) {
        return this.engineSchemas[ntype]
    }
}