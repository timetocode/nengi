import { Schema } from '../../common/binary/schema/Schema'
import binaryGet from '../../common/binary/BinaryExt'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'

function writeMessage(obj: any, nschema: Schema, bufferWriter: IBinaryWriter) {
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = binaryGet(propData.type)
        const writer = binaryUtil.write
        const value = obj[propData.prop]
        // @ts-ignore
        bufferWriter[writer](value)
    }
}

export default writeMessage
