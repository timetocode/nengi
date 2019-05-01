import Binary from '../../binary/Binary';
//var config = require('../../../config')

function readBatch(bitStream, entityCache, config) {
    var batch = {}

    var id = bitStream[Binary[config.ID_BINARY_TYPE].read]()
    var schema = entityCache.getEntity(id).protocol

    batch.id = id
    batch.updates = []

    schema.batch.keys.forEach(prop => {
        var propData = schema.batch.properties[prop]
        var value = bitStream[Binary[propData.type].read]()
        batch.updates.push({
            isDelta: propData.delta,
            prop: prop,
            path: propData.path,
            value: value
        })
    })

    return batch
}

export default readBatch;
