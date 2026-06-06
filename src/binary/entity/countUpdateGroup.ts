import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, byteSizeOfNetworkType } from '../../common/binary/Protocol'
import { EntityUpdateGroup } from '../../common/binary/schema/util'

function countUpdateGroup(update: EntityUpdateGroup, nidType: NetworkIdType = Binary.UInt8) {
    let bytes = byteSizeOfNetworkType(nidType) + 1
    for (let i = 0; i < update.group.props.length; i++) {
        bytes += update.group.props[i].binary.byteSize(update.values[i])
    }
    return bytes
}

export default countUpdateGroup
