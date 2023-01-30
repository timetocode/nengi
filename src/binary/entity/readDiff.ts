import binaryGet from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'
import IEntity from '../../common/IEntity'

function readDiff(reader: IBinaryReader, context: Context, entities: Map<number, IEntity>) {

    const nid = reader.readUInt32()
    const propKey = reader.readUInt8()

    // @ts-ignore
    const ntype = entities.get(nid).ntype

    const nschema = context.getSchema(ntype)!


    //console.log('READDIFF', { nid, propKey, ntype, nschema })

    const propData = nschema.keys[propKey]
    const binaryUtil = binaryGet(propData.type)
    const readerFnStr = binaryUtil.read
    // @ts-ignore
    const value = reader[readerFnStr]()

    const diff = {
        nid,
        prop: propData.prop,
        value
    }

    //console.log(diff)
    return diff

}

export default readDiff