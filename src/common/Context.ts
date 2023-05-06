import { connectionAttemptSchema } from './schemas/connectAttemptSchema'
import { EngineMessage } from './EngineMessage'
import { Schema } from './binary/schema/Schema'
import { connectionAcceptedSchema } from './schemas/connectionAcceptedSchema'
import { connectionDeniedSchema } from './schemas/connectionDeniedSchema'
import { connectionTerminatedSchema } from './schemas/connectionTerminatedSchema'
import { clientTickSchema } from './schemas/clientTickSchema'
import { timeSyncSchema } from './schemas/timeSyncSchema'

class Context {
	/**
	 * user-defined network schemas
	 */
	schemas: Map<number, Schema>

	/**
	 * schemas internal to nengi
	 */
	engineSchemas: Map<number, Schema>

	constructor() {
		this.schemas = new Map()
		this.engineSchemas = new Map()

		// setup the engine schemas
		this.engineSchemas.set(EngineMessage.ConnectionAttempt, connectionAttemptSchema)
		this.engineSchemas.set(EngineMessage.ConnectionAccepted, connectionAcceptedSchema)
		this.engineSchemas.set(EngineMessage.ConnectionDenied, connectionDeniedSchema)
		this.engineSchemas.set(EngineMessage.ConnectionTerminated, connectionTerminatedSchema)
		this.engineSchemas.set(EngineMessage.ClientTick, clientTickSchema)
		this.engineSchemas.set(EngineMessage.TimeSync, timeSyncSchema)
	}

	register(ntype: number, schema: Schema) {
		this.schemas.set(ntype, schema)
	}

	getSchema(ntype: number) {
		return this.schemas.get(ntype)
	}

	getEngineSchema(ntype: number) {
		return this.engineSchemas.get(ntype)
	}
}

export { Context }
