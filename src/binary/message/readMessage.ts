import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'

function readMessage(reader: IBinaryReader, context: Context) {
    const ntype = reader.readUInt8()
    const nschema = context.getSchema(ntype)!
    const obj = { ntype }
    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = binaryGet(propData.type)
        // @ts-ignore
        obj[propData.prop] = binaryUtil.post(binaryUtil.read(reader))
    }
    return obj
}

export default readMessage