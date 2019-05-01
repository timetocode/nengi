import Binary from '../../binary/Binary';
import writeProp from './writeProp';

function writeSingle(bitStream, partial) { 
    bitStream[Binary[partial.idType].write](partial.id)
    bitStream[Binary[partial.keyType].write](partial.key)
    //console.log(partial)
    writeProp(bitStream, partial.valueType, undefined, partial.value)
    //bitStream[Binary[partial.valueType].write](partial.value)
}

export default writeSingle;