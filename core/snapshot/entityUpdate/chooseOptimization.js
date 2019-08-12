import isBatchAtomiclyValid from './isBatchAtomiclyValid.js';
import compare from '../../protocol/compare.js';
import getValue from '../../protocol/getValue.js';

function locateDiff(prop, diffs) {
    for (var i = 0; i < diffs.length; i++) {
        if (diffs[i].prop === prop) {
            return diffs[i]
        }
    }
    return null
}

// 3 cases: batch update, single prop update, or no update needed
export default function chooseOptimization(idPropertyName, oldProxy, newProxy, protocol) {

    var id = oldProxy[idPropertyName]
    var idType = protocol.properties[idPropertyName].type

    var formattedUpdates = {
        batch: {
            id: id,
            idType: idType,
            updates: []
        },
        singleProps: []
    }

    var diffs = compare(oldProxy, newProxy, protocol)

    if (diffs.length === 0) {
        return formattedUpdates
    }

    // batching is disabled until a future version
    var isBatchValid = false //isBatchAtomiclyValid(diffs, protocol)

    if (isBatchValid) {
        protocol.batch.keys.forEach(key => {
            var diff = locateDiff(key, diffs)
            var opt = protocol.batch.properties[key]
            var propData = protocol.properties[key]

            var value = 0

            if (diff) {
                if (opt.delta) {
                    value = diff.is - diff.was
                } else {
                    value = diff.is
                }
            } else {
                if (!opt.delta) {
                    value = newProxy[key]
                }
            }

            formattedUpdates.batch.updates.push({
                isDelta: opt.delta,
                value: value,
                valueType: opt.type,
                prop: key,
                path: propData.path
            })
        })
    }    

    for (var i = 0; i < diffs.length; i++) {
        var diff = diffs[i]
        var opt = null

        if (protocol.hasOptimizations) {
            opt = protocol.batch.properties[diff.prop]
        }

        if (isBatchValid && opt) {

        } else {
            var propData = protocol.properties[diff.prop]
            
            formattedUpdates.singleProps.push({
                id: id,
                idType: idType,
                key: propData.key,
                keyType: protocol.keyType,
                value: diff.is,
                valueType: propData.type,
                prop: diff.prop,
                path: diff.path
            })
        }
    }

    return formattedUpdates
};