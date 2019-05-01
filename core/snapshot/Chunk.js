//var selectUIntType = require('../schema/selectUIntType')
import BinaryType from '../binary/BinaryType';

var reverse = {}
function createEnum(values) {
  var enumm = {}
    for (var i = 0; i < values.length; i++) {
    var value = values[i]
    enumm[value] = i
    reverse[i] = value
  }
  return enumm
}

var snapshotCategories = [
    'ClientTick',
    'Ping',
    'Pong',
    'Timesync',

    'CreateEntities',
    'UpdateEntitiesPartial',
    'UpdateEntitiesOptimized',
    'DeleteEntities',

    'CreateComponents',
    'UpdateComponentsPartial',
    'UpdateComponentsOptimized',
    'DeleteComponents',

    'Messages',
    'LocalEvents',
    'Commands',
    'JSONs',

    'TransferClient',
    'TransferRequest',
    'TransferResponse',

    'Handshake',
    'ConnectionResponse',

    'Engine'
]

// must be at least one byte to avoid cornercase buffer reading bugs
var chunkType = BinaryType.UInt8//selectUIntType(snapshotCategories.length)

var Chunk = createEnum(snapshotCategories)

export const ChunkReverse = reverse;
export { Chunk };
