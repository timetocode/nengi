import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'
import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, byteSizeOfNetworkType } from '../../common/binary/Protocol'

function count(schema: Schema, message: any, ntypeType: NetworkIdType = Binary.UInt8) {
    let bytes = byteSizeOfNetworkType(ntypeType)
    schema.keys.forEach(propData => {
        const spec = binaryGet(propData.type)
        // @ts-ignore
        bytes += spec.byteSize(message[propData.prop])
    })
    return bytes
}

export default count
