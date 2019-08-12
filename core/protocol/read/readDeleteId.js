import Binary from '../../binary/Binary.js';

var readDelete = function(bitStream, idType) {
    bitStream[Binary[idType].read]()
}

export default readDelete;