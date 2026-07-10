import { Binary } from './binary/Binary'
import { defineMessageSchema, definePayloadSchema } from './binary/schema/defineSchema'
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
})
