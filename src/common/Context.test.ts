import { Binary } from './binary/Binary'
import { defineMessageSchema } from './binary/schema/defineSchema'
import { Context } from './Context'

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
})
