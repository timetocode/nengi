import { Binary } from './binary/Binary'
import { defineEntitySchema, defineMessageSchema, definePayloadSchema } from './binary/schema/defineSchema'
import { Context } from './Context'
import { defineEndpoint } from './Endpoint'
import { createSchemaFingerprint } from './binary/schema/schemaFingerprint'

describe('Context', () => {
    it('rejects schema ids outside the supported network id range', () => {
        const context = new Context()
        const schema = defineMessageSchema({ value: Binary.UInt8 })

        expect(() => context.register(0, schema)).toThrow('Schema id')
        expect(() => context.register(0xffffffff + 1, schema)).toThrow('Schema id')
        expect(() => context.register(1.5, schema)).toThrow('Schema id')
    })

    it('rejects duplicate schema ids instead of silently replacing the wire contract', () => {
        const context = new Context()
        const schema = defineMessageSchema({ value: Binary.UInt8 })

        context.register(1, schema)

        expect(() => context.register(1, schema)).toThrow('already registered')
    })

    it('throws a descriptive error when a schema is missing', () => {
        const context = new Context()

        expect(() => context.getSchema(7)).toThrow('Schema id 7 is not registered')
        expect(() => context.getEngineSchema(999)).toThrow('Engine schema id 999 is not registered')
    })

    it('registers endpoint definitions as part of the protocol contract', () => {
        const context = new Context()
        const endpoint = defineEndpoint(7, {
            requestSchema: definePayloadSchema({ value: Binary.UInt8 }),
            responseSchema: definePayloadSchema({ accepted: Binary.Boolean })
        })

        context.registerEndpoint(endpoint)
        expect(context.endpointDefinitions.get(7)).toBe(endpoint)
        expect(() => context.registerEndpoint(defineEndpoint(7))).toThrow('already registered')
    })

    it('changes the schema fingerprint when a registered endpoint changes', () => {
        const first = new Context()
        const second = new Context()
        const firstEndpoint = defineEndpoint(7, {
            requestSchema: definePayloadSchema({ value: Binary.UInt8 })
        })
        const secondEndpoint = defineEndpoint(7, {
            requestSchema: definePayloadSchema({ value: Binary.UInt16 })
        })

        first.registerEndpoint(firstEndpoint)
        second.registerEndpoint(secondEndpoint)

        expect(createSchemaFingerprint(first)).not.toBe(createSchemaFingerprint(second))
    })

    it('invalidates cached fingerprints after new registrations and preserves registration-order independence', () => {
        const context = new Context()
        const empty = createSchemaFingerprint(context)
        const schema = defineMessageSchema({ value: Binary.UInt8 })
        context.register(256, schema)
        const withSchema = createSchemaFingerprint(context)
        expect(withSchema).not.toBe(empty)

        const endpoint = defineEndpoint(7, { requestSchema: definePayloadSchema({ value: Binary.UInt16 }) })
        context.registerEndpoint(endpoint)
        const withEndpoint = createSchemaFingerprint(context)
        expect(withEndpoint).not.toBe(withSchema)

        const reversed = new Context()
        reversed.registerEndpoint(endpoint)
        reversed.register(256, schema)
        expect(createSchemaFingerprint(reversed)).toBe(withEndpoint)
    })

    it('reuses fingerprints without traversing unchanged definitions or runtime update-group state', () => {
        const context = new Context()
        const schema = defineEntitySchema({
            x: Binary.Float32,
            y: Binary.Float32,
            $options: { updateGroups: { position: ['x', 'y'] } }
        })
        const endpoint = defineEndpoint(7)
        context.register(1, schema)
        context.registerEndpoint(endpoint)
        const fingerprint = createSchemaFingerprint(context)
        const schemas = jest.spyOn(context.schemas, 'entries')
        const endpoints = jest.spyOn(context.endpointDefinitions, 'entries')
        try {
            context.registerEndpoint(endpoint)
            schema.updateGroupGeneration++
            schema.updateGroups[0].lastEmitGeneration++
            expect(createSchemaFingerprint(context)).toBe(fingerprint)
            expect(createSchemaFingerprint(context)).toBe(fingerprint)
            expect(schemas).not.toHaveBeenCalled()
            expect(endpoints).not.toHaveBeenCalled()
        } finally {
            schemas.mockRestore()
            endpoints.mockRestore()
        }
    })
})
