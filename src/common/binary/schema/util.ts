import { IEntity } from '../../IEntity'
import { binaryGet } from '../BinaryExt'
import { Schema } from './Schema'

/**
 * Copies an object based on an nschema, copies only the properties listed in the nschema
 * @param entity
 * @param nschema
 * @returns the copied object
 */
export function copyNObject(entity: IEntity, nschema: Schema) {
    const ncopy: IEntity = { nid: 0, ntype: 0 }
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = entity[propData.prop]
        const binaryUtil = binaryGet(propData.type)
        ncopy[propData.prop] = binaryUtil.clone(value)
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
        const binaryUtil = binaryGet(propData.type)
        target[propData.prop] = binaryUtil.clone(value)
    }
}

export type EntityChange = { nid: number, nschema: Schema, prop: string, value: any }

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
        const { prop, type } = nschema.keys[i]
        const oldValue = previous[prop]
        const value = current[prop]
        const binaryUtil = binaryGet(type)
        if (!binaryUtil.compare(oldValue, value)) {
            entityChanges.push({ nid: current.nid, nschema, prop, value })
            previous[prop] = binaryUtil.clone(value)
        }
    }
    return entityChanges
}