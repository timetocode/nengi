import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

function readTimesync(bitStream) {
    return {
        time: bitStream[Binary[BinaryType.Float64].read](),
        avgLatency: bitStream[Binary[BinaryType.UInt9].read](),
    }
}

export default readTimesync;