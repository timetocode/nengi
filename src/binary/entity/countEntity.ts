import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, byteSizeOfNetworkType } from '../../common/binary/Protocol'
import { Schema } from '../../common/binary/schema/Schema'

function countEntity(schema: Schema, entity: any, ntypeType: NetworkIdType = Binary.UInt8, nidType: NetworkIdType = Binary.UInt8) {
    let bytes = byteSizeOfNetworkType(ntypeType) + byteSizeOfNetworkType(nidType)
    schema.keys.forEach(propData => {
        bytes += propData.binary.byteSize(entity[propData.prop])
    })
    return bytes
}

export default countEntity
