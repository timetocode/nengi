import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'

function count(schema: Schema, entity: any) {
    let bytes = 0
    schema.keys.forEach(propData => {
        const spec = binaryGet(propData.type)
        // @ts-ignore
        bytes += spec.byteSize(entity[propData.prop])
    })
    return bytes
}

export default count
