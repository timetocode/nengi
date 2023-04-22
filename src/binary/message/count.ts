import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'

function count(schema: Schema, entity: any) {
    //console.log({ schema, entity })
    let bytes = 0
    schema.keys.forEach(propData => {
        const spec = binaryGet(propData.type)
        const b = binaryGet(propData.type).bytes
        if (spec.bytes !== -1) {
            bytes += spec.bytes
        } else {
            // @ts-ignore
            bytes += spec.byteSize(entity[propData.prop])
        }
        /*
        if (b === -1) {
            // @ts-ignore
            bytes += binaryGet(propData.type).count(entity[propData.prop])
        } else {
            bytes += b
        }
        */
       // bytes += binaryGet(propData.type).bytes
    })
    return bytes
}

export default count
