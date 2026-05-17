import { Schema } from './Schema'
import { SchemaDefinition } from './SchemaDefinition'

type SchemaKind = 'entity' | 'message' | 'payload'


function compileSchema(schema: SchemaDefinition, kind: SchemaKind): Schema {
    const compiled = new Schema(kind)
    let index = 0

    for (const prop in schema) {
        if ((kind === 'entity' || kind === 'message') && prop === 'ntype') {
            throw new Error('No need to define `ntype` in a schema, this is added by the network envelope.')
        }
        if (kind === 'entity' && prop === 'nid') {
            throw new Error('No need to define `nid` in an entity schema, this is added by the entity envelope.')
        }

        const spec = schema[prop]
        if (typeof spec === 'object' && spec !== null && 'type' in spec) {
            // probably the syntax x: { type: Binary.Float32, interp: true }
            const entry = { key: index, prop, type: spec.type, interp: spec.interp, }
            compiled.keys.push(entry)
            compiled.props[prop] = entry
            index++
        } else {
            // probably the syntax x: Binary.Float32
            const entry = { key: index, prop, type: spec, interp: false }
            compiled.keys.push(entry)
            compiled.props[prop] = entry
            index++
        }


    }
    return compiled
}

function defineEntitySchema(schema: SchemaDefinition): Schema {
    return compileSchema(schema, 'entity')
}

function defineMessageSchema(schema: SchemaDefinition): Schema {
    return compileSchema(schema, 'message')
}

function definePayloadSchema(schema: SchemaDefinition): Schema {
    return compileSchema(schema, 'payload')
}

const createEntity = defineEntitySchema
const createMessage = defineMessageSchema

export {
    createEntity,
    createMessage,
    defineEntitySchema,
    defineMessageSchema,
    definePayloadSchema
}
