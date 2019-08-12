import Binary from '../../binary/Binary.js';

var writeDeleteId = function(bitStream, idType, id) {
    bitStream[Binary[idType].write](id)
}

export default writeDeleteId;