import calculateValue from './calculateValue';
import Binary from '../../binary/Binary';

function isBatchAtomiclyValid(diffs, schema) {

    if (!schema.hasOptimizations) {
        return false
    }

    var valid = true
    var batchContainsChanges = false

    diffs.forEach(diff => {
        var prop = schema.keys[diff.key]
        var opt = schema.batch.properties[prop]
        if (opt) {
            var binaryType = Binary[opt.type]
            var value = calculateValue(diff.was, diff.is, opt.delta)
            if (opt.delta) {
                if (value !== 0) {
                    batchContainsChanges = true
                }
            } else {
                if (diff.was !== diff.is) {
                    batchContainsChanges = true
                }
            }
            if (!binaryType.boundsCheck(value)) {
                valid = false
            }
        }
    })

    return valid && batchContainsChanges
}

export default isBatchAtomiclyValid;