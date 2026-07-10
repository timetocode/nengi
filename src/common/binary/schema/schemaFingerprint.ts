import { Context } from '../../Context'
import { Schema } from './Schema'

function describeSchema(schema: Schema) {
    const props = schema.keys.map(prop => [
        prop.key,
        prop.prop,
        prop.type,
        prop.interp ? 1 : 0
    ].join(':')).join(',')
    const updateGroups = schema.updateGroups.map(group => [
        group.key,
        group.name,
        group.mode,
        group.props.map(prop => prop.key).join('.')
    ].join(':')).join(',')
    return `${schema.kind}|${props}|${updateGroups}`
}

function stableSchemaString(context: Context) {
    // The fingerprint is not a globally unique proof. It is a deterministic
    // checksum over registered entity/message schemas and endpoint payload
    // schemas. Sorting by id makes registration order irrelevant, while
    // preserving property order inside each schema because property order is
    // wire-relevant. This catches accidental protocol drift during handshake;
    // it is not a cryptographic collision-resistant proof.
    const schemas = Array.from(context.schemas.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([ntype, schema]) => `${ntype}|${describeSchema(schema)}`)
    const endpoints = Array.from(context.endpointDefinitions.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([id, endpoint]) => [
            id,
            endpoint.requestSchema ? describeSchema(endpoint.requestSchema) : '-',
            endpoint.responseSchema ? describeSchema(endpoint.responseSchema) : '-'
        ].join('|'))
    return `schemas:${schemas.join(';')};endpoints:${endpoints.join(';')}`
}

function fnv1a32(value: string) {
    let hash = 0x811c9dc5
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createSchemaFingerprint(context: Context) {
    return fnv1a32(stableSchemaString(context))
}

export function describeSchemaFingerprint(context: Context) {
    return stableSchemaString(context)
}
