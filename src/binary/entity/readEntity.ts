import binaryGet from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'


function readEntity(reader: IBinaryReader, context: Context) {
    //console.log('entered readEntity')
    const ntype = reader.readUInt8()
    //console.log('type was', ntype)
    const nschema = context.getSchema(ntype)!

    const entity: any = {}
    entity.ntype = ntype

    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = binaryGet(propData.type)
        const readerFnStr = binaryUtil.read

        // @ts-ignore
        const value = reader[readerFnStr]()
        // @ts-ignore
        entity[propData.prop] = value

        //console.log('value was', value, { propData})
    }
    return entity
}

export default readEntity