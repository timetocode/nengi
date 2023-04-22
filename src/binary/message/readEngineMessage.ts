import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'

function readEngineMessage(reader: IBinaryReader, context: Context) {
    //console.log('entered readMEssage')
    const ntype = reader.readUInt8()
    const nschema = context.getEngineSchema(ntype)!
    const obj = {
        ntype,
    }
    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = binaryGet(propData.type)

        if (binaryUtil.bytes !== -1) {
            const readerFnStr = binaryUtil.read
            // @ts-ignore
            const value = reader[readerFnStr]()    
            // @ts-ignore
            obj[propData.prop] = value
        } else {
            // @ts-ignore
            obj[propData.prop] = binaryUtil.read(reader)
        }    
    }
    return obj
}

export default readEngineMessage