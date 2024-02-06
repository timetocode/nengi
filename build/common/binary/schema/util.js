"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareAndUpdateNObject = exports.updateNObject = exports.copyNObject = void 0;
const BinaryExt_1 = require("../BinaryExt");
/**
 * Copies an object based on an nschema, copies only the properties listed in the nschema
 * @param entity
 * @param nschema
 * @returns the copied object
 */
function copyNObject(entity, nschema) {
    const ncopy = { nid: 0, ntype: 0 };
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const value = entity[propData.prop];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        ncopy[propData.prop] = binaryUtil.clone(value);
    }
    return ncopy;
}
exports.copyNObject = copyNObject;
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
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        target[propData.prop] = binaryUtil.clone(value);
    }
}
exports.updateNObject = updateNObject;
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
        const { prop, type } = nschema.keys[i];
        const oldValue = previous[prop];
        const value = current[prop];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(type);
        if (!binaryUtil.compare(oldValue, value)) {
            entityChanges.push({ nid: current.nid, nschema, prop, value });
            previous[prop] = binaryUtil.clone(value);
        }
    }
    return entityChanges;
}
exports.compareAndUpdateNObject = compareAndUpdateNObject;
