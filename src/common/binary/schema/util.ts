import { IEntity } from '../../IEntity'
import { Schema, SchemaUpdateGroup } from './Schema'

/**
 * Copies an object based on an nschema, copies only the properties listed in the nschema
 * @param entity
 * @param nschema
 * @returns the copied object
 */
export function copyNObject(entity: IEntity, nschema: Schema) {
    const ncopy: IEntity = { nid: entity.nid, ntype: entity.ntype }
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = entity[propData.prop]
        ncopy[propData.prop] = propData.binary.clone(value)
    }
    return ncopy
}

/**
 * Copies the networked properties from source to target
 * @param source
 * @param target
 * @param nschema
 */
export function updateNObject(source: IEntity, target: IEntity, nschema: Schema) {
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = source[propData.prop]
        target[propData.prop] = propData.binary.clone(value)
    }
}

export type EntityChange = { nid: number, nschema: Schema, prop: string, value: any }
export type EntityUpdateGroup = { nid: number, nschema: Schema, group: SchemaUpdateGroup, values: any[] }
export type EntityDiffResult = { changes: EntityChange[], groups: EntityUpdateGroup[] }

function emitUpdateGroup(
    current: IEntity,
    previous: IEntity,
    nschema: Schema,
    group: SchemaUpdateGroup,
    generation: number,
    groups: EntityUpdateGroup[]
) {
    if (group.lastEmitGeneration === generation) {
        return
    }

    group.lastEmitGeneration = generation
    const values: any[] = []
    for (let i = 0; i < group.props.length; i++) {
        const { prop, binary } = group.props[i]
        const value = current[prop]
        values.push(binary.clone(value))
        previous[prop] = binary.clone(value)
    }
    groups.push({ nid: current.nid, nschema, group, values })
}

function allGroupPropsChanged(current: IEntity, previous: IEntity, group: SchemaUpdateGroup) {
    for (let i = 0; i < group.props.length; i++) {
        const { prop, binary } = group.props[i]
        if (binary.compare(previous[prop], current[prop])) {
            return false
        }
    }
    return true
}

/**
 * Compares two IEntities looking only at the properties in the nschema and returns any changes
 * @param current
 * @param previous
 * @param nschema
 * @returns
 */
export function compareAndUpdateNObject(current: IEntity, previous: IEntity, nschema: Schema) {
    const entityChanges: EntityChange[] = []

    for (let i = 0; i < nschema.keys.length; i++) {
        const { prop, binary } = nschema.keys[i]
        const oldValue = previous[prop]
        const value = current[prop]
        if (!binary.compare(oldValue, value)) {
            entityChanges.push({ nid: current.nid, nschema, prop, value: binary.clone(value) })
            previous[prop] = binary.clone(value)
        }
    }
    return entityChanges
}

/**
 * Diff variant for grouped entity updates. The default group mode is "any":
 * the first changed property in a group emits the whole group and the remaining
 * properties in that group are skipped for this entity. That is deliberately a
 * CPU optimization for transform-like data where x/y/z/rotation usually move
 * together and checking every field before deciding to bundle would lose much
 * of the benefit.
 */
export function compareAndUpdateNObjectGrouped(current: IEntity, previous: IEntity, nschema: Schema): EntityDiffResult {
    if (nschema.updateGroups.length === 0) {
        return {
            changes: compareAndUpdateNObject(current, previous, nschema),
            groups: []
        }
    }

    const changes: EntityChange[] = []
    const groups: EntityUpdateGroup[] = []
    const generation = ++nschema.updateGroupGeneration

    for (let i = 0; i < nschema.keys.length; i++) {
        const propSpec = nschema.keys[i]
        const group = propSpec.updateGroup
        if (group && group.lastEmitGeneration === generation) {
            continue
        }

        const { prop, binary } = propSpec
        const oldValue = previous[prop]
        const value = current[prop]
        if (binary.compare(oldValue, value)) {
            continue
        }

        if (group && group.mode === 'any') {
            emitUpdateGroup(current, previous, nschema, group, generation, groups)
        } else if (group && group.mode === 'full' && allGroupPropsChanged(current, previous, group)) {
            emitUpdateGroup(current, previous, nschema, group, generation, groups)
        } else {
            changes.push({ nid: current.nid, nschema, prop, value: binary.clone(value) })
            previous[prop] = binary.clone(value)
        }
    }

    return { changes, groups }
}
