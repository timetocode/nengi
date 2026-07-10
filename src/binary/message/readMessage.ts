import { Binary } from '../../common/binary/Binary'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { NetworkIdType, readNetworkId } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'

function readMessage(reader: IBinaryReader, context: Context, ntypeType: NetworkIdType = Binary.UInt8) {
    const ntype = readNetworkId(ntypeType, reader)
    const nschema = context.getSchema(ntype)!
    const obj: any = { ntype }
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        obj[propData.prop] = propData.binary.post(propData.binary.read(reader))
    }
    return obj
}

export default readMessage
