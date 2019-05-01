import BitBuffer from '../../binary/BitBuffer';
import BitStream from '../../binary/BitStream';
import countMessagesBits from './countMessagesBits';
import writeMessages from './writeMessages';
import writeCreateEntities from './writeCreateEntities';
import writeLocalEvents from './writeLocalEvents';
import countBatchesBits from './countBatchesBits';
import writeBatches from './writeBatches';
import countSinglePropsBits from './countSinglePropsBits';
import writeSingleProps from './writeSingleProps';
import countDeleteEntitiesBits from './countDeleteEntitiesBits';
import writeDeleteEntities from './writeDeleteEntities';
import countJSONsBits from './countJSONsBits';
import writeJSONs from './writeJSONs';
import countTimesyncBits from './countTimesyncBits';
import writeTimesync from './writeTimesync';
import countPingBits from './countPingBits';
import writePing from './writePing';
import writeEngineMessages from './writeEngineMessages';
import { Chunk } from '../Chunk';

//var countTransferBits = require('./countTransferBits')
//var writeTransfer = require('./writeTransfer')


function createSnapshotBuffer(snapshot, config) {
    var bits = 0
    bits += 40

    bits += countMessagesBits(snapshot.engineMessages)
    bits += countPingBits(snapshot.pingKey)
    bits += countTimesyncBits(snapshot.timestamp)

    bits += countMessagesBits(snapshot.createEntities)
    bits += countSinglePropsBits(snapshot.updateEntities.partial)
    //bits += countBatchesBits(snapshot.updateEntities.optimized)
    bits += countDeleteEntitiesBits(snapshot.deleteEntities, config)

    //bits += countMessagesBits(snapshot.createComponents)
    //bits += countSinglePropsBits(snapshot.updateComponents.partial)
    //bits += countDeleteEntitiesBits(snapshot.deleteComponents, config)
   
    bits += countMessagesBits(snapshot.localEvents)
    bits += countMessagesBits(snapshot.messages)
    bits += countJSONsBits(snapshot.jsons)

    //console.log('partials', snapshot.updateEntities.partial)
    var bitBuffer = new BitBuffer(bits)
    var bitStream = new BitStream(bitBuffer)

    bitStream.writeUInt8(Chunk.ClientTick)
    bitStream.writeUInt32(snapshot.clientTick)

    writeEngineMessages(bitStream, snapshot.engineMessages)
    writePing(bitStream, snapshot.pingKey)
    writeTimesync(bitStream, snapshot.timestamp, snapshot.avgLatency)

    writeCreateEntities(Chunk.CreateEntities, bitStream, snapshot.createEntities)
    writeSingleProps(Chunk.UpdateEntitiesPartial, bitStream, snapshot.updateEntities.partial)
    //writeBatches(bitStream, snapshot.updateEntities.optimized)
    writeDeleteEntities(Chunk.DeleteEntities, bitStream, snapshot.deleteEntities, config)

    //writeCreateEntities(Chunk.CreateComponents, bitStream, snapshot.createComponents)
    //writeSingleProps(Chunk.UpdateComponentsPartial, bitStream, snapshot.updateComponents.partial)
    //writeDeleteEntities(Chunk.DeleteComponents, bitStream, snapshot.deleteComponents, config)
    
    writeLocalEvents(bitStream, snapshot.localEvents)
    writeMessages(bitStream, snapshot.messages)
    writeJSONs(bitStream, snapshot.jsons)

    //console.log('wrote', bits)

    return bitBuffer
}

export default createSnapshotBuffer;
