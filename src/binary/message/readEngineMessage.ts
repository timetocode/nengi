import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { Context } from '../../common/Context'

function readEngineMessage(reader: IBinaryReader, context: Context) {
    //console.log('entered readMEssage')
    const ntype = reader.readUInt8()
    const nschema = context.getEngineSchema(ntype)!
    const obj: any = { ntype }
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        obj[propData.prop] = propData.binary.read(reader)
    }
    return obj
}

export default readEngineMessage
