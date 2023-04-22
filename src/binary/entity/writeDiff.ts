import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'

function writeDiff(nid: number, diff: any, nschema: Schema, bufferWriter: IBinaryWriter) {
    const propData = nschema.props[diff.prop]
    const binaryUtil = binaryGet(propData.type)
    bufferWriter.writeUInt32(nid)
    bufferWriter.writeUInt8(propData.key)
    binaryUtil.write(diff.value, bufferWriter)
}

export default writeDiff