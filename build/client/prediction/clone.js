"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clone = void 0;
const clone = (entity, nschema) => {
    const clonedObj = {};
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const value = entity[propData.prop];
        // @ts-ignore
        clonedObj[propData.prop] = propData.binary.clone(value);
    }
    return clonedObj;
};
exports.clone = clone;
