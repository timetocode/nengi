import { Binary } from '../../common/binary/Binary'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { NetworkIdType, writeNetworkId } from '../../common/binary/Protocol'
import { Schema } from '../../common/binary/schema/Schema'

function writeEntity(entity: any, nschema: Schema, bufferWriter: IBinaryWriter, ntypeType: NetworkIdType = Binary.UInt8, nidType: NetworkIdType = Binary.UInt8) {
    writeNetworkId(entity.ntype, ntypeType, bufferWriter)
    writeNetworkId(entity.nid, nidType, bufferWriter)
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const value = entity[propData.prop]
        propData.binary.write(value, bufferWriter)
    }
}

export { writeEntity }
