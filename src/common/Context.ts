import { connectionAttemptSchema } from './schemas/connectAttemptSchema'
import { EngineMessage } from './EngineMessage'
import { Schema } from './binary/schema/Schema'
import { connectionAcceptedSchema } from './schemas/connectionAcceptedSchema'
import { connectionDeniedSchema } from './schemas/connectionDeniedSchema'
import { connectionTerminatedSchema } from './schemas/connectionTerminatedSchema'
import { commandFrameNumberSchema } from './schemas/commandFrameNumberSchema'
import { timeSyncSchema } from './schemas/timeSyncSchema'
import { pingSchema } from './schemas/pingSchema'
import { pongSchema } from './schemas/pongSchema'
import { protocolSchema } from './schemas/protocolSchema'
import { commandTimingSchema } from './schemas/commandTimingSchema'
import { interpolationDelaySchema } from './schemas/interpolationDelaySchema'
import { Binary } from './binary/Binary'
import { NetworkIdType, networkTypeForMaxValue } from './binary/Protocol'

const MAX_SCHEMA_ID = 0xffffffff

function assertValidSchemaId(ntype: number) {
    if (!Number.isSafeInteger(ntype) || ntype <= 0 || ntype > MAX_SCHEMA_ID) {
        throw new Error(`Schema id must be an integer from 1 to ${MAX_SCHEMA_ID}.`)
    }
}

export class Context {
    /**
	 * user-defined network schemas
	 */
    schemas: Map<number, Schema>

    /**
	 * schemas internal to nengi
	 */
    engineSchemas: Map<number, Schema>
    ntypeType: NetworkIdType

    constructor() {
        this.schemas = new Map()
        this.engineSchemas = new Map()
        this.ntypeType = Binary.UInt8

        // setup the engine schemas
        this.engineSchemas.set(EngineMessage.ConnectionAttempt, connectionAttemptSchema)
        this.engineSchemas.set(EngineMessage.ConnectionAccepted, connectionAcceptedSchema)
        this.engineSchemas.set(EngineMessage.ConnectionDenied, connectionDeniedSchema)
        this.engineSchemas.set(EngineMessage.ConnectionTerminated, connectionTerminatedSchema)
        this.engineSchemas.set(EngineMessage.CommandFrameNumber, commandFrameNumberSchema)
        this.engineSchemas.set(EngineMessage.TimeSync, timeSyncSchema)
        this.engineSchemas.set(EngineMessage.Ping, pingSchema)
        this.engineSchemas.set(EngineMessage.Pong, pongSchema)
        this.engineSchemas.set(EngineMessage.Protocol, protocolSchema)
        this.engineSchemas.set(EngineMessage.CommandTiming, commandTimingSchema)
        this.engineSchemas.set(EngineMessage.InterpolationDelay, interpolationDelaySchema)
    }

    register(ntype: number, schema: Schema) {
        assertValidSchemaId(ntype)
        if (this.schemas.has(ntype)) {
            throw new Error(`Schema id ${ntype} is already registered.`)
        }
        this.schemas.set(ntype, schema)
        this.ntypeType = networkTypeForMaxValue(Math.max(...this.schemas.keys()))
    }

    getSchema(ntype: number) {
        return this.schemas.get(ntype)!
    }

    getEngineSchema(ntype: number) {
        return this.engineSchemas.get(ntype)!
    }
}
