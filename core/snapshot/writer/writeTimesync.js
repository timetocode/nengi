import { Chunk } from '../Chunk';
import BinaryType from '../../binary/BinaryType';
import Binary from '../../binary/Binary';

function writeTimesync(bitStream, time, avgLatency) {
    //console.log('invoked', time)
    if (time > -1) {
        bitStream.writeUInt8(Chunk.Timesync)
        bitStream.writeFloat64(time)
        //console.log('writing latency', avgLatency)
        bitStream.writeUInt9(avgLatency)
    }
}

export default writeTimesync;