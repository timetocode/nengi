import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'
import { IEntity } from '../../common/IEntity'

function readDiff(reader: IBinaryReader, context: Context, ntypes: Map<number, number> /* <nid, ntype> */) {
    const nid = reader.readUInt32()
    const propKey = reader.readUInt8()
    const ntype = ntypes.get(nid)!
    const nschema = context.getSchema(ntype)!
    const propData = nschema.keys[propKey]
    const binaryUtil = binaryGet(propData.type)
    const value = binaryUtil.read(reader)
    return {
        nid,
        prop: propData.prop,
        value
    }
}

export default readDiff