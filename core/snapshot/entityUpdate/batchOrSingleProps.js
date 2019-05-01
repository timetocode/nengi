import isBatchAtomiclyValid from './isBatchAtomiclyValid';
import compare from '../../protocol/compare';

function batchOrSingleProps(oldProxy, newProxy, schema) {
    var singlePropUpdates = []
    var batchedUpdates = []
    var diffs = compare(oldProxy, newProxy, schema)
    //console.log('diffs', diffs)


    // can batch mode be used on these values?
    var batchable = isBatchAtomiclyValid(diffs, schema)

    // is there any overlap between diffs and the batchable properties?
    var useBatch = false
    if (schema.hasOptimizations) {        
        for (var i = 0; i < diffs.length; i++) {
            var diff = diffs[i]
            var opt = schema.batch.properties[diff.prop]

            if (opt) {
                useBatch = true
            }
        }
    }

    for (var i = 0; i < diffs.length; i++) {
        var diff = diffs[i]

        var optimization = null
        if (schema.hasOptimizations) {
            optimization = schema.batch.properties[diff.prop]
        } 

        if (useBatch && batchable && optimization) {
            // will be batched
        } else {
            // update this property individually
            singlePropUpdates.push(diff.prop)
        }
    }

    if (useBatch && batchable) {
        batchedUpdates = []
        // all batched properties
        schema.batch.keys.forEach(prop => {
            batchedUpdates.push(prop)
        })
    }

    var foo = { 
        batchedUpdates: batchedUpdates, 
        singlePropUpdates: singlePropUpdates,
        diffs: diffs
    }
        //console.log('foo', foo)

    return foo
}

export default batchOrSingleProps;