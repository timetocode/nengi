import { Context } from '../../Context'
import { Schema } from './Schema'

function stableSchemaString(schemas: Map<number, Schema>) {
    // The fingerprint is not a globally unique proof. It is a deterministic
    // checksum over the wire-relevant schema contract: ntype id, schema kind,
    // property order/key, property name, binary type, and interp flag. Sorting
    // by ntype makes registration order irrelevant, while preserving property
    // order inside each schema because property order is wire-relevant. If the
    // client and server compile the same schemas they produce the same string
    // and hash; if they change a wire-relevant detail they should produce a
    // different hash. This is meant to catch accidental schema drift during
    // handshake, not to provide cryptographic collision resistance.
    const entries = Array.from(schemas.entries()).sort((a, b) => a[0] - b[0])
    return entries.map(([ntype, schema]) => {
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
        return `${ntype}|${schema.kind}|${props}|${updateGroups}`
    }).join(';')
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
    return fnv1a32(stableSchemaString(context.schemas))
}

export function describeSchemaFingerprint(context: Context) {
    return stableSchemaString(context.schemas)
}
