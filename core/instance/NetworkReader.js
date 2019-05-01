import BitBuffer from '../schema/BitBuffer';
import BitStream from '../schema/BitStream';
import Binary from '../schema/Binary';
import BinaryType from '../schema/BinaryType';
import read from '../schema/read';
import { Chunk } from './Chunk';
import { chunkType } from './Chunk';
import deproxify from '../schema/deproxify';
import readPartial from '../schema/readPartial';
import readOptimized from '../schema/readOptimized';
import EntityCache from './EntityCache';

function Reader(instance) {
    this.instance = instance
    this.schemas = {}
    this.entityCache = new EntityCache()
}

Reader.prototype.forgetEntity = function(id) {
    delete this.state[id]
}

Reader.prototype.getSchemaByEntityId = function(id) {
    return this.schemas[id]
}

Reader.prototype.registerSchema = function(id, schema) {
    this.schemas[id] = schema
}

Reader.prototype.unregisterSchema = function(id) {
    delete this.schemas[id]
}

Reader.prototype.read = function(bitBuffer) {
    console.log('READING BUFFER')

    var snapshot = {
        createEntities: [],
        updateEntities: [],
        deleteEntities: []
    }

    var bitStream = new BitStream(bitBuffer)
    while (bitStream.offset < bitStream.bitBuffer.bitLength) {
        var msgType = bitStream[Binary[chunkType].read]()
        switch (msgType) {

            case Chunk.CreateEntities:
                var length = bitStream.readUInt8()
                console.log('CreateEntities', length)          
                for (var i = 0; i < length; i++) {
                    var type = bitStream[Binary[this.instance.config.TYPE_BINARY_TYPE].read]()
                    var schema = this.instance.schemas.entity.getSchema(type)
                    //console.log('get schema by type', type)
                    //console.log('schema foound', schema)
                    var proxy = read(bitStream, schema, 1, type, this.instance.config.TYPE_PROPERTY_NAME)
                    //console.log('prox', proxy)
                    var entity = deproxify(proxy, schema)
                    console.log('ent', entity)
                    var id = entity[this.instance.config.ID_PROPERTY_NAME]
                    entity.protocol = schema
                    snapshot.createEntities.push(entity)
                    this.registerSchema(id, schema)
                    this.entityCache.saveEntity(entity)
                }
                break

            case Chunk.DeleteEntities:
                var length = bitStream.readUInt8()
                console.log('DeleteEntities', length)
                for (var i = 0; i < length; i++) {
                    var id = bitStream[Binary[this.instance.config.ID_BINARY_TYPE].read]()
                    snapshot.deleteEntities.push(id)
                    this.unregisterSchema(id)
                    this.entityCache.forgetEntity(id)
                }

                break

            case Chunk.UpdateEntitiesPartial:
                var length = bitStream.readUInt8()
                console.log('UpdateEntitiesPartial', length)
                for (var i = 0; i < length; i++) {
                    var id = bitStream[Binary[this.instance.config.ID_BINARY_TYPE].read]()
                    var schema = this.getSchemaByEntityId(id)
                    var update = readPartial(bitStream, schema)
                    this.entityCache.updateEntityPartial(id, update.prop, update.value)
                    snapshot.updateEntities.push({ 
                        id: id, 
                        prop: update.prop, 
                        value: update.value 
                    })

                }
                break

            case Chunk.UpdateEntitiesOptimized:
                var length = bitStream.readUInt8()
                console.log('UpdateEntitiesOptimized', length)
                for (var i = 0; i < length; i++) {
                    var id = bitStream[Binary[this.instance.config.ID_BINARY_TYPE].read]()
                    
                    var schema = this.getSchemaByEntityId(id)
                    var entity = this.entityCache.getEntity(id)
                    //console.log('optimizating for', entity)
                    var updates = readOptimized(bitStream, entity.protocol)
                    //console.log('read optimized', temp)
                    updates.forEach(update => {
                        snapshot.updateEntities.push({
                            id: id,
                            prop: update.prop,
                            value: entity[update.prop] + update.deltaValue
                        })
                        this.entityCache.updateEntityOptimized(id, update.prop, update.deltaValue)
                    })
                }                
                break

            default:
                throw new Error('Unknown msg type or buffer read out of sync')
        }
    }
    

    console.log('CLIENT snapshot', snapshot)

    //this.state.processSnapshot(snapshot)
}

export default Reader;