import { Schema } from '../../common/binary/schema/Schema'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, writeNetworkId } from '../../common/binary/Protocol'

function writeDiff(nid: number, diff: any, nschema: Schema, bufferWriter: IBinaryWriter, nidType: NetworkIdType = Binary.UInt8) {
    const propData = nschema.props[diff.prop]
    writeNetworkId(nid, nidType, bufferWriter)
    bufferWriter.writeUInt8(propData.key)
    propData.binary.write(diff.value, bufferWriter)
}

export default writeDiff
