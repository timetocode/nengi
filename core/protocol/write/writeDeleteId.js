import Binary from '../../binary/Binary';

var writeDeleteId = function(bitStream, idType, id) {
    bitStream[Binary[idType].write](id)
}

export default writeDeleteId;