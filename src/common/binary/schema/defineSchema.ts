import { Schema } from './Schema'
import { SchemaDefinition, SchemaOptions, UpdateGroupDefinition } from './SchemaDefinition'
import { binaryGet } from '../BinaryExt'

type SchemaKind = 'entity' | 'message' | 'payload'

function createPropSpec(key: number, prop: string, type: any, interp: boolean) {
    const entry = { key, prop, type, interp } as any
    Object.defineProperty(entry, 'binary', {
        value: binaryGet(type),
        enumerable: false
    })
    return entry
}

function normalizeUpdateGroups(options: SchemaOptions | undefined): UpdateGroupDefinition[] {
    if (!options?.updateGroups) {
        return []
    }

    if (Array.isArray(options.updateGroups)) {
        return options.updateGroups
    }

    return Object.entries(options.updateGroups).map(([name, definition]) => {
        if (Array.isArray(definition)) {
            return { name, props: definition }
        }
        return { name, props: definition.props, mode: definition.mode }
    })
}

function compileUpdateGroups(compiled: Schema, options: SchemaOptions | undefined) {
    const groups = normalizeUpdateGroups(options)
    for (let i = 0; i < groups.length; i++) {
        const definition = groups[i]
        const name = Array.isArray(definition) ? `group${i}` : (definition.name ?? `group${i}`)
        const propNames = Array.isArray(definition) ? definition : definition.props
        const mode = Array.isArray(definition) ? 'any' : (definition.mode ?? 'any')

        if (propNames.length < 2) {
            throw new Error(`Update group "${name}" must include at least two properties.`)
        }
        if (compiled.updateGroups.length > 255) {
            throw new Error('A schema may define at most 256 update groups.')
        }

        const props = propNames.map(propName => {
            const prop = compiled.props[propName]
            if (!prop) {
                throw new Error(`Update group "${name}" references unknown property "${propName}".`)
            }
            if (prop.updateGroup) {
                throw new Error(`Property "${propName}" is already in update group "${prop.updateGroup.name}".`)
            }
            return prop
        })

        const group = {
            key: compiled.updateGroups.length,
            name,
            mode,
            props,
            lastEmitGeneration: 0
        }
        props.forEach(prop => {
            prop.updateGroup = group
        })
        compiled.updateGroups.push(group)
    }
}

function compileSchema(schema: SchemaDefinition, kind: SchemaKind): Schema {
    const compiled = new Schema(kind)
    let index = 0
    const options = schema.$options

    for (const prop in schema) {
        if (prop === '$options') {
            continue
        }
        if ((kind === 'entity' || kind === 'message') && prop === 'ntype') {
            throw new Error('No need to define `ntype` in a schema, this is added by the network envelope.')
        }
        if (kind === 'entity' && prop === 'nid') {
            throw new Error('No need to define `nid` in an entity schema, this is added by the entity envelope.')
        }

        const spec = schema[prop]
        if (typeof spec === 'object' && spec !== null && 'type' in spec) {
            // probably the syntax x: { type: Binary.Float32, interp: true }
            const entry = createPropSpec(index, prop, spec.type, spec.interp ?? false)
            compiled.keys.push(entry)
            compiled.props[prop] = entry
            index++
        } else {
            // probably the syntax x: Binary.Float32
            const entry = createPropSpec(index, prop, spec, false)
            compiled.keys.push(entry)
            compiled.props[prop] = entry
            index++
        }


    }
    if (kind === 'entity') {
        compileUpdateGroups(compiled, options)
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
