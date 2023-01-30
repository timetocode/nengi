// @ts-nocheck
import { Schema } from '../common/binary/schema/Schema'

import { Buffer } from 'buffer'
import binaryGet from '../common/binary/BinaryExt'
import { Binary } from '../common/binary/Binary'




function serialize(obj: any, schema: Schema) {

    let bytes = 0
    schema.keys.forEach(propData => {
        //console.log('xx', propData)

        bytes += binaryGet(propData.type).bytes
        //console.log('byte size', binaryGet(propData.type).bytes)
    })

    console.log('total bytes', bytes)

    const buf = Buffer.allocUnsafe(bytes)

    //const start = Date.now()

    let offset = 0
    schema.keys.forEach(propData => {
        //console.log('xx', propData)
        // bytes += binaryGet(propData.type).bytes
        const binaryUtil = binaryGet(propData.type)
        const writer = binaryUtil.write

        const value = obj[propData.prop]

        //console.log(writer, value, offset)
        // @ts-ignore
        buf[writer](value, offset)
        //if (propData.type === Binary.Float64) {
        //    buf.writeFloatBE(value, offset)
        //} else if(propData.type === Binary.UInt16) {
        //    buf.writeUInt16BE(value, offset)
        //}
        offset += binaryUtil.bytes
        //console.log('byte size', binaryGet(propData.type).bytes)
    })

    //const stop = Date.now()
    //console.log('yo', stop - start)

    console.log(buf)

    let offset2 = 0
    schema.keys.forEach(propData => {
        //console.log('xx', propData)
        // bytes += binaryGet(propData.type).bytes
        const binaryUtil = binaryGet(propData.type)
        const reader = binaryUtil.read

        //const value = obj[propData.prop]

        //console.log(reader, value)
        // @ts-ignore
        const value = buf[reader](offset2)
        console.log(reader, propData.prop, value, 'offset', offset2, 'should be', obj[propData.prop])
        offset2 += binaryUtil.bytes
        //console.log('byte size', binaryGet(propData.type).bytes)
    })
}

export default serialize