import { Binary } from '../../common/binary/Binary'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { NetworkIdType, readNetworkId } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'

function readDiff(reader: IBinaryReader, context: Context, ntypes: Map<number, number> /* <nid, ntype> */, nidType: NetworkIdType = Binary.UInt8) {
    const nid = readNetworkId(nidType, reader)
    const propKey = reader.readUInt8()
    const ntype = ntypes.get(nid)!
    const nschema = context.getSchema(ntype)!
    if (!nschema) {
        throw new Error(`Cannot read diff for unknown entity nid ${nid}; ntype=${String(ntype)} propKey=${propKey}.`)
    }
    const propData = nschema.keys[propKey]
    if (!propData) {
        throw new Error(`Cannot read diff prop ${propKey} for entity nid ${nid}; ntype=${ntype}.`)
    }
    const value = propData.binary.read(reader)
    return {
        nid,
        prop: propData.prop,
        value
    }
}

export default readDiff
