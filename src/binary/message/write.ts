import { Schema } from '../../common/binary/schema/Schema'
import { Buffer } from 'buffer'
import binaryGet from '../../common/binary/BinaryExt'

function write(buffer: Buffer, offset: number, obj: any, schema: Schema) {
    schema.keys.forEach(propData => {
        const binaryUtil = binaryGet(propData.type)
        const writer = binaryUtil.write
        const value = obj[propData.prop]
        //console.log(writer, value, offset)
        // @ts-ignore
        buffer[writer](value, offset)
        offset += binaryUtil.bytes
    })
    return offset
}

export default write
