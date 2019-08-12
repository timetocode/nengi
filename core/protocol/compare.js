import Binary from '../binary/Binary.js';
import getValue from './getValue.js';

function compare(proxyA, proxyB, protocol) {
    var diffs = []

    for (var i = 0; i < protocol.keys.length; i++) {
        var propName = protocol.keys[i]
        var propData = protocol.properties[propName]

        var valueA = getValue(proxyA, propData.path)
        var valueB = getValue(proxyB, propData.path)
        //var valueA = proxyA[propName]
        //var valueB = proxyB[propName]

        if (propData.protocol === null && !propData.isArray) {
            
            var comparison = Binary[propData.type].compare(valueA, valueB)
            //console.log('comparison', valueA, valueB, comparison)
            if (comparison.isChanged) {
                diffs.push({ 
                    prop: propName, 
                    path: propData.path,
                    was: comparison.a, 
                    is: comparison.b, 
                    key: i, 
                    type: propData.type 
                })
            }
        }
    }

    return diffs
}

export default compare;