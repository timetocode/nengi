import { Binary } from '../../common/binary/Binary'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { NetworkIdType, readNetworkId } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'

function readUpdateGroup(reader: IBinaryReader, context: Context, ntypes: Map<number, number>, nidType: NetworkIdType = Binary.UInt8) {
    const nid = readNetworkId(nidType, reader)
    const groupKey = reader.readUInt8()
    const ntype = ntypes.get(nid)!
    const nschema = context.getSchema(ntype)!
    const group = nschema.updateGroups[groupKey]
    const diffs: any[] = []

    for (let i = 0; i < group.props.length; i++) {
        const propData = group.props[i]
        diffs.push({
            nid,
            prop: propData.prop,
            value: propData.binary.post(propData.binary.read(reader))
        })
    }

    return diffs
}

export default readUpdateGroup
