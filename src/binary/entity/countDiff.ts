import { Schema } from '../../common/binary/schema/Schema'
import binaryGet from '../../common/binary/BinaryExt'

function countDiff(diff: any, nschema: Schema) {
    let bytes = 0
    // add id, prop, value
    bytes += 4 + 1
    const prop = diff.prop
    const propData = nschema.props[prop]
    bytes += binaryGet(propData.type).bytes
    return bytes
}

export default countDiff
