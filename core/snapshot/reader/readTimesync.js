import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function readTimesync(bitStream) {
    return {
        time: bitStream[Binary[BinaryType.Float64].read](),
        avgLatency: bitStream[Binary[BinaryType.UInt9].read](),
    }
}

export default readTimesync;