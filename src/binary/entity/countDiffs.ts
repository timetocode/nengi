import { Schema } from '../../common/binary/schema/Schema'
import binaryGet from '../../common/binary/BinaryExt'

function countDiffs(diffs: any, nschema: Schema) {
    let bytes = 0

    diffs.forEach((diff: any) => {
        // add id, prop, value
        bytes += 4 + 1
        const prop = diff.prop
        const propData = nschema.props[prop]
        bytes += binaryGet(propData.type).bytes
    })

   // schema.keys.forEach(propData => {
    //    bytes += binaryGet(propData.type).bytes
   // })
    return bytes
}

export default countDiffs
