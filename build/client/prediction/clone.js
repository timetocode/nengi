'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.clone = void 0
const BinaryExt_1 = require('../../common/binary/BinaryExt')
const clone = (entity, nschema) => {
    const clonedObj = {}
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = entity[propData.prop]
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type)
        // @ts-ignore
        clonedObj[propData.prop] = binaryUtil.clone(value)
    }
    return clonedObj
}
exports.clone = clone
//# sourceMappingURL=clone.js.map