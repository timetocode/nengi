import Binary from '../../binary/Binary';

function writeBatch(bitStream, batch) {
    bitStream[Binary[batch.idType].write](batch.id)
    batch.updates.forEach(update => {
        bitStream[Binary[update.valueType].write](update.value)
    })
}

export default writeBatch;