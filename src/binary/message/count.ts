import { Schema } from '../../common/binary/schema/Schema'
import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, byteSizeOfNetworkType } from '../../common/binary/Protocol'

function count(schema: Schema, message: any, ntypeType: NetworkIdType = Binary.UInt8) {
    let bytes = byteSizeOfNetworkType(ntypeType)
    schema.keys.forEach(propData => {
        bytes += propData.binary.byteSize(message[propData.prop])
    })
    return bytes
}

export default count
