import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';

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