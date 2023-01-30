import { Schema } from '../../common/binary/schema/Schema'
import binaryGet from '../../common/binary/BinaryExt'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'

function writeDiff(nid: number, diff: any, nschema: Schema, bufferWriter: IBinaryWriter) {
    const prop = diff.prop
    const propData = nschema.props[prop]
    const binaryUtil = binaryGet(propData.type)
    const writer = binaryUtil.write
    const value = diff.value

    //console.log({ prop, propData, value })
    // @ts-ignore
    bufferWriter.writeUInt32(nid)
    // @ts-ignore
    bufferWriter.writeUInt8(propData.key)
    // @ts-ignore
    bufferWriter[writer](value)
}

export default writeDiff