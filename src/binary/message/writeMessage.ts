import { Schema } from '../../common/binary/schema/Schema'
import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { Binary } from '../../common/binary/Binary'
import { NetworkIdType, writeNetworkId } from '../../common/binary/Protocol'

function writeMessage(obj: any, nschema: Schema, bufferWriter: IBinaryWriter, ntypeType: NetworkIdType = Binary.UInt8) {
    writeNetworkId(obj.ntype, ntypeType, bufferWriter)
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = binaryGet(propData.type)
        const value = obj[propData.prop]
        binaryUtil.write(value, bufferWriter)
    }
}

export { writeMessage }
