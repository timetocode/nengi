import binaryGet from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'

function readMessage(reader: IBinaryReader, context: Context) {
    //console.log('entered readMEssage')
    const ntype = reader.readUInt8()
    const nschema = context.getSchema(ntype)!
    const obj = {
        ntype,
    }
    //console.log({ nschema })
    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = binaryGet(propData.type)
        const readerFnStr = binaryUtil.read

        //console.log({ binaryUtil })

        // @ts-ignore
        const value = reader[readerFnStr]()

        //console.log('value was', value)
         // @ts-ignore
        obj[propData.prop] = value
    }
    return obj
}

export default readMessage