import { Binary } from '../../common/binary/Binary'
import { binaryGet } from '../../common/binary/BinaryExt'
import { NetworkIdType, byteSizeOfNetworkType } from '../../common/binary/Protocol'
import { Schema } from '../../common/binary/schema/Schema'

function countEntity(schema: Schema, entity: any, ntypeType: NetworkIdType = Binary.UInt8, nidType: NetworkIdType = Binary.UInt8) {
    let bytes = byteSizeOfNetworkType(ntypeType) + byteSizeOfNetworkType(nidType)
    schema.keys.forEach(propData => {
        const spec = binaryGet(propData.type)
        bytes += spec.byteSize(entity[propData.prop])
    })
    return bytes
}

export default countEntity
