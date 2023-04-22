import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'
import IEntity from '../../common/IEntity'

function readDiff(reader: IBinaryReader, context: Context, entities: Map<number, IEntity>) {
    const nid = reader.readUInt32()
    const propKey = reader.readUInt8()
    const ntype = entities.get(nid)!.ntype
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