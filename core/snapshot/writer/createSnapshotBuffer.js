import BitBuffer from '../../binary/BitBuffer.js';
import BitStream from '../../binary/BitStream.js';
import countMessagesBits from './countMessagesBits.js';
import writeMessages from './writeMessages.js';
import writeCreateEntities from './writeCreateEntities.js';
import writeLocalEvents from './writeLocalEvents.js';
import countBatchesBits from './countBatchesBits.js';
import writeBatches from './writeBatches.js';
import countSinglePropsBits from './countSinglePropsBits.js';
import writeSingleProps from './writeSingleProps.js';
import countDeleteEntitiesBits from './countDeleteEntitiesBits.js';
import writeDeleteEntities from './writeDeleteEntities.js';
import countJSONsBits from './countJSONsBits.js';
import writeJSONs from './writeJSONs.js';
import countTimesyncBits from './countTimesyncBits.js';
import writeTimesync from './writeTimesync.js';
import countPingBits from './countPingBits.js';
import writePing from './writePing.js';
import writeEngineMessages from './writeEngineMessages.js';
import { Chunk } from '../Chunk.js';

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
