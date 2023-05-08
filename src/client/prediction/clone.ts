import { binaryGet } from '../../common/binary/BinaryExt'
import { Schema } from '../../common/binary/schema/Schema'

const clone = (entity: any, nschema: Schema) => {
    const clonedObj = {}
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = entity[propData.prop]
        const binaryUtil = binaryGet(propData.type)
        // @ts-ignore
        clonedObj[propData.prop] = binaryUtil.clone(value)
    }
    return clonedObj
}


export { clone }