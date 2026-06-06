import { Binary } from '../../common/binary/Binary'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { NetworkIdType, writeNetworkId } from '../../common/binary/Protocol'
import { EntityUpdateGroup } from '../../common/binary/schema/util'

function writeUpdateGroup(update: EntityUpdateGroup, writer: IBinaryWriter, nidType: NetworkIdType = Binary.UInt8) {
    writeNetworkId(update.nid, nidType, writer)
    writer.writeUInt8(update.group.key)
    for (let i = 0; i < update.group.props.length; i++) {
        update.group.props[i].binary.write(update.values[i], writer)
    }
}

export default writeUpdateGroup
