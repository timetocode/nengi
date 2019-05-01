import calculateValue from './calculateValue';
import batchOrSingleProps from './batchOrSingleProps';

function formatUpdates(idPropertyName, oldProxy, newProxy, schema) {

    var updates = batchOrSingleProps(oldProxy, newProxy, schema)

    var id = oldProxy[idPropertyName]
    var idType = schema.properties[idPropertyName].type

    var formattedUpdates = {
        batch: {
            id: id,
            idType: idType,
            updates: []
        },
        singleProps: []
    }

    updates.singlePropUpdates.forEach(prop => {
        var propData = schema.properties[prop]

        formattedUpdates.singleProps.push({
            id: id,
            idType: idType,
            key: propData.key,
            keyType: schema.keyType,
            value: newProxy[prop],
            valueType: propData.type,
            prop: prop
        })
    })

    updates.batchedUpdates.forEach(prop => {
        var propData = schema.properties[prop]
        var optData = schema.batch.properties[prop]

        var oldValue = oldProxy[prop]
        var newValue = newProxy[prop]

        var value = calculateValue(oldValue, newValue, optData.delta)

        formattedUpdates.batch.updates.push({
            isDelta: optData.delta,
            value: value,
            valueType: optData.type,
            prop: prop
        })
    })

    return formattedUpdates
}

export default formatUpdates;