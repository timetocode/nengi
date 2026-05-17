import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'
import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, byteSizeOfNetworkType } from '../../common/binary/Protocol'

function countDiff(diff: any, nschema: Schema, nidType: NetworkIdType = Binary.UInt8) {
    let bytes = 0
    // add id, prop, value
    bytes += byteSizeOfNetworkType(nidType) + 1
    const prop = diff.prop
    const propData = nschema.props[prop]
    bytes += binaryGet(propData.type).byteSize(diff.value)
    return bytes
}

export default countDiff
