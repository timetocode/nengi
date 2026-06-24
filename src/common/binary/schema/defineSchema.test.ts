import { Binary } from '../Binary'
import { defineEntitySchema, defineMessageSchema, definePayloadSchema } from './defineSchema'

describe('defineSchema helpers', () => {
    it('defines entity schemas without storing envelope fields as properties', () => {
        const schema = defineEntitySchema({
            x: Binary.Float64,
            y: { type: Binary.Float64, interp: true },
            label: Binary.String
        })

        expect(schema.keys).toEqual([
            { key: 0, prop: 'x', type: Binary.Float64, interp: false },
            { key: 1, prop: 'y', type: Binary.Float64, interp: true },
            { key: 2, prop: 'label', type: Binary.String, interp: false }
        ])

        expect(schema.kind).toBe('entity')
        expect(schema.props.x).toBe(schema.keys[0])
        expect(schema.props.y).toBe(schema.keys[1])
        expect(schema.props.label).toBe(schema.keys[2])
    })

    it('rejects envelope fields on entity schemas', () => {
        expect(() => defineEntitySchema({ ntype: Binary.UInt8 })).toThrow('ntype')
        expect(() => defineEntitySchema({ nid: Binary.UInt16 })).toThrow('nid')
    })

    it('defines message schemas with ntype in the envelope and nid available as payload', () => {
        const schema = defineMessageSchema({
            nid: Binary.UInt32,
            text: Binary.String
        })

        expect(schema.kind).toBe('message')
        expect(schema.keys).toEqual([
            { key: 0, prop: 'nid', type: Binary.UInt32, interp: false },
            { key: 1, prop: 'text', type: Binary.String, interp: false }
        ])
        expect(() => defineMessageSchema({ ntype: Binary.UInt8 })).toThrow('ntype')
    })

    it('defines payload schemas without automatic network identity fields', () => {
        const schema = definePayloadSchema({
            nid: Binary.UInt32,
            open: Binary.Boolean
        })

        expect(schema.keys).toEqual([
            { key: 0, prop: 'nid', type: Binary.UInt32, interp: false },
            { key: 1, prop: 'open', type: Binary.Boolean, interp: false }
        ])
    })

    it('compiles entity update groups with any as the default mode', () => {
        const schema = defineEntitySchema({
            x: Binary.Float32,
            y: Binary.Float32,
            color: Binary.String,
            $options: {
                updateGroups: {
                    position: ['x', 'y']
                }
            }
        })

        expect(schema.updateGroups).toHaveLength(1)
        expect(schema.updateGroups[0].key).toBe(0)
        expect(schema.updateGroups[0].name).toBe('position')
        expect(schema.updateGroups[0].mode).toBe('any')
        expect(schema.updateGroups[0].props).toEqual([schema.props.x, schema.props.y])
        expect(schema.props.x.updateGroup).toBe(schema.updateGroups[0])
        expect(schema.props.y.updateGroup).toBe(schema.updateGroups[0])
    })

    it('rejects schemas with more properties than can be addressed by one-byte diff keys', () => {
        const definition: any = {}
        for (let i = 0; i < 257; i++) {
            definition[`prop${i}`] = Binary.UInt8
        }

        expect(() => defineEntitySchema(definition)).toThrow('at most 256 properties')
    })
})
