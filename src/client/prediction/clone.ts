import { Schema } from '../../common/binary/schema/Schema'

const clone = (entity: any, nschema: Schema) => {
    const clonedObj = {}
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = entity[propData.prop]
        // @ts-ignore
        clonedObj[propData.prop] = propData.binary.clone(value)
    }
    return clonedObj
}


export { clone }
