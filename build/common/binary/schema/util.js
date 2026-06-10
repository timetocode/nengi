"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyNObject = copyNObject;
exports.updateNObject = updateNObject;
exports.compareAndUpdateNObject = compareAndUpdateNObject;
exports.compareAndUpdateNObjectGrouped = compareAndUpdateNObjectGrouped;
/**
 * Copies an object based on an nschema, copies only the properties listed in the nschema
 * @param entity
 * @param nschema
 * @returns the copied object
 */
function copyNObject(entity, nschema) {
    const ncopy = { nid: entity.nid, ntype: entity.ntype };
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const value = entity[propData.prop];
        ncopy[propData.prop] = propData.binary.clone(value);
    }
    return ncopy;
}
/**
 * Copies the networked properties from source to target
 * @param source
 * @param target
 * @param nschema
 */
function updateNObject(source, target, nschema) {
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const value = source[propData.prop];
        target[propData.prop] = propData.binary.clone(value);
    }
}
function emitUpdateGroup(current, previous, nschema, group, generation, groups) {
    if (group.lastEmitGeneration === generation) {
        return;
    }
    group.lastEmitGeneration = generation;
    const values = [];
    for (let i = 0; i < group.props.length; i++) {
        const { prop, binary } = group.props[i];
        const value = current[prop];
        values.push(binary.clone(value));
        previous[prop] = binary.clone(value);
    }
    groups.push({ nid: current.nid, nschema, group, values });
}
function allGroupPropsChanged(current, previous, group) {
    for (let i = 0; i < group.props.length; i++) {
        const { prop, binary } = group.props[i];
        if (binary.compare(previous[prop], current[prop])) {
            return false;
        }
    }
    return true;
}
/**
 * Compares two IEntities looking only at the properties in the nschema and returns any changes
 * @param current
 * @param previous
 * @param nschema
 * @returns
 */
function compareAndUpdateNObject(current, previous, nschema) {
    const entityChanges = [];
    for (let i = 0; i < nschema.keys.length; i++) {
        const { prop, binary } = nschema.keys[i];
        const oldValue = previous[prop];
        const value = current[prop];
        if (!binary.compare(oldValue, value)) {
            entityChanges.push({ nid: current.nid, nschema, prop, value: binary.clone(value) });
            previous[prop] = binary.clone(value);
        }
    }
    return entityChanges;
}
/**
 * Diff variant for grouped entity updates. The default group mode is "any":
 * the first changed property in a group emits the whole group and the remaining
 * properties in that group are skipped for this entity. That is deliberately a
 * CPU optimization for transform-like data where x/y/z/rotation usually move
 * together and checking every field before deciding to bundle would lose much
 * of the benefit.
 */
function compareAndUpdateNObjectGrouped(current, previous, nschema) {
    if (nschema.updateGroups.length === 0) {
        return {
            changes: compareAndUpdateNObject(current, previous, nschema),
            groups: []
        };
    }
    const changes = [];
    const groups = [];
    const generation = ++nschema.updateGroupGeneration;
    for (let i = 0; i < nschema.keys.length; i++) {
        const propSpec = nschema.keys[i];
        const group = propSpec.updateGroup;
        if (group && group.lastEmitGeneration === generation) {
            continue;
        }
        const { prop, binary } = propSpec;
        const oldValue = previous[prop];
        const value = current[prop];
        if (binary.compare(oldValue, value)) {
            continue;
        }
        if (group && group.mode === 'any') {
            emitUpdateGroup(current, previous, nschema, group, generation, groups);
        }
        else if (group && group.mode === 'full' && allGroupPropsChanged(current, previous, group)) {
            emitUpdateGroup(current, previous, nschema, group, generation, groups);
        }
        else {
            changes.push({ nid: current.nid, nschema, prop, value: binary.clone(value) });
            previous[prop] = binary.clone(value);
        }
    }
    return { changes, groups };
}
