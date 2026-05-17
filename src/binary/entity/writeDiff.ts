import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, writeNetworkId } from '../../common/binary/Protocol'

function writeDiff(nid: number, diff: any, nschema: Schema, bufferWriter: IBinaryWriter, nidType: NetworkIdType = Binary.UInt8) {
    const propData = nschema.props[diff.prop]
    const binaryUtil = binaryGet(propData.type)
    writeNetworkId(nid, nidType, bufferWriter)
    bufferWriter.writeUInt8(propData.key)
    binaryUtil.write(diff.value, bufferWriter)
}

export default writeDiff
