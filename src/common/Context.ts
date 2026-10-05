import { connectionAttemptSchema } from './schemas/connectAttemptSchema'
import { EngineMessage } from './EngineMessage'
import { Schema } from './binary/schema/Schema'
import { connectionAcceptedSchema } from './schemas/connectionAcceptedSchema'
import { connectionDeniedSchema } from './schemas/connectionDeniedSchema'
import { connectionTerminatedSchema } from './schemas/connectionTerminatedSchema'
import { commandFrameNumberSchema } from './schemas/commandFrameNumberSchema'
import { pingSchema } from './schemas/pingSchema'
import { pongSchema } from './schemas/pongSchema'
import { protocolSchema } from './schemas/protocolSchema'
import { commandTimingSchema } from './schemas/commandTimingSchema'
import { interpolationDelaySchema } from './schemas/interpolationDelaySchema'
import { Binary } from './binary/Binary'
import { NetworkIdType, networkTypeForMaxValue } from './binary/Protocol'
import { EndpointDefinition, getEndpointId } from './Endpoint'
import { invalidateSchemaFingerprint } from './binary/schema/schemaFingerprint'

const MAX_SCHEMA_ID = 0xffffffff

function assertValidSchemaId(ntype: number) {
    if (!Number.isSafeInteger(ntype) || ntype <= 0 || ntype > MAX_SCHEMA_ID) {
        throw new Error(`Schema id must be an integer from 1 to ${MAX_SCHEMA_ID}.`)
    }
}

export class Context {
    private readonly registeredSchemas = new Map<number, Schema>()
    private readonly registeredEndpoints = new Map<number, EndpointDefinition>()

    /** Inspect registrations; use register() to add immutable protocol definitions. */
    readonly schemas: ReadonlyMap<number, Schema> = this.registeredSchemas

    /**
	 * schemas internal to nengi
	 */
    engineSchemas: Map<number, Schema>
    /** Inspect registrations; use registerEndpoint() to add protocol definitions. */
    readonly endpointDefinitions: ReadonlyMap<number, EndpointDefinition> = this.registeredEndpoints
    ntypeType: NetworkIdType

    constructor() {
        this.engineSchemas = new Map()
        this.ntypeType = Binary.UInt8

        // setup the engine schemas
        this.engineSchemas.set(EngineMessage.ConnectionAttempt, connectionAttemptSchema)
        this.engineSchemas.set(EngineMessage.ConnectionAccepted, connectionAcceptedSchema)
        this.engineSchemas.set(EngineMessage.ConnectionDenied, connectionDeniedSchema)
        this.engineSchemas.set(EngineMessage.ConnectionTerminated, connectionTerminatedSchema)
        this.engineSchemas.set(EngineMessage.CommandFrameNumber, commandFrameNumberSchema)
        this.engineSchemas.set(EngineMessage.Ping, pingSchema)
        this.engineSchemas.set(EngineMessage.Pong, pongSchema)
        this.engineSchemas.set(EngineMessage.Protocol, protocolSchema)
        this.engineSchemas.set(EngineMessage.CommandTiming, commandTimingSchema)
        this.engineSchemas.set(EngineMessage.InterpolationDelay, interpolationDelaySchema)
    }

    /** Register setup data before connecting; do not mutate its protocol metadata. */
    register(ntype: number, schema: Schema) {
        assertValidSchemaId(ntype)
        if (this.schemas.has(ntype)) {
            throw new Error(`Schema id ${ntype} is already registered.`)
        }
        this.registeredSchemas.set(ntype, schema)
        this.ntypeType = networkTypeForMaxValue(Math.max(...this.schemas.keys()))
        invalidateSchemaFingerprint(this)
    }

    /** Register setup data before connecting; do not mutate its payload schemas. */
    registerEndpoint(endpoint: EndpointDefinition) {
        const id = getEndpointId(endpoint)
        const existing = this.endpointDefinitions.get(id)
        if (existing && existing !== endpoint) {
            throw new Error(`Endpoint id ${id} is already registered.`)
        }
        if (!existing) {
            this.registeredEndpoints.set(id, endpoint)
            invalidateSchemaFingerprint(this)
        }
        return endpoint
    }

    getSchema(ntype: number) {
        const schema = this.schemas.get(ntype)
        if (!schema) {
            throw new Error(`Schema id ${ntype} is not registered.`)
        }
        return schema
    }

    getEngineSchema(ntype: number) {
        const schema = this.engineSchemas.get(ntype)
        if (!schema) {
            throw new Error(`Engine schema id ${ntype} is not registered.`)
        }
        return schema
    }
}
