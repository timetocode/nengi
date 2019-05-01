import EDictionary from '../../external/EDictionary';
import copyProxy from '../protocol/copyProxy';
import getValue from '../protocol/getValue';
import setValue from '../protocol/setValue';

function WorldState(tick, timeBetweenSnapshots, snapshot, previousWorldState, config) {
    this.config = config
    this.timeBetweenSnapshots = timeBetweenSnapshots
    this.tick = tick
    this.clientTick = snapshot.clientTick
    this.raw = snapshot
    this.processed = false
   
    this.timestamp = snapshot.timestamp
    // entity state
    this.entities = new EDictionary(config.ID_PROPERTY_NAME)


    this.noInterps = []

    this.createEntities = []
    this.updateEntities = []
    this.deleteEntities = []

    this.updateLookUp = {}

    // localMessage state
    this.localMessages = []
    // message state
    this.messages = []
    // jsons
    this.jsons = []

    this.ping = -1
    //this.temporalOffset = -1

    this.init(snapshot, previousWorldState)
}

WorldState.prototype.containsUpdateFor = function(id, prop) {
    if (this.updateLookUp[id] && !isNaN(this.updateLookUp[id][prop])) {
        return true
    }
    return false
}

WorldState.prototype.init = function(snapshot, previousWorldState) {
    //console.log(snapshot)
    if (previousWorldState) {
        if (this.timestamp === -1) {
            this.timestamp = previousWorldState.timestamp + this.timeBetweenSnapshots
        }

        previousWorldState.entities.forEach(entity => {
            var clone = copyProxy(entity, entity.protocol)
            clone.protocol = entity.protocol
            this.entities.add(clone)
        })
    }

    snapshot.engineMessages.forEach(message => {
        this.noInterps = message.ids
    })

    snapshot.createEntities.forEach(entity => {
        //this.createdEntityIds.push(entity.id)

        //console.log('yolo', entity)
        var clone = copyProxy(entity, entity.protocol)
        clone.protocol = entity.protocol
        //console.log('yolo2', clone)
        this.entities.add(clone)
        this.createEntities.push(clone)
    })

    snapshot.localMessages.forEach(localMessage => {
        var clone = copyProxy(localMessage, localMessage.protocol)
        clone.protocol = localMessage.protocol
        this.localMessages.push(clone)
    })

    snapshot.messages.forEach(message => {
        var clone = copyProxy(message, message.protocol)
        clone.protocol = message.protocol
        this.messages.push(clone)
    })

    snapshot.jsons.forEach(json => {
        this.jsons.push(JSON.parse(json))
    })

    snapshot.updateEntities.partial.forEach(update => {
        //console.log('YOLO', update)
        //this.updatedEntityIds.push(singleProp[this.config.ID_PROPERTY_NAME])
        const id = update[this.config.ID_PROPERTY_NAME]
        const entity = this.entities.get(id)
        //console.log('b4', entity.x)
        //entity[singleProp.prop] = singleProp.value
        setValue(entity, update.path, update.value)
        //console.log('after', entity.x)
        const updateCopy = { 
            [this.config.ID_PROPERTY_NAME]: id, 
            prop: update.prop,
            path: update.path,
            value: update.value
        }

        this.updateEntities.push(updateCopy)
        if (!this.updateLookUp[id]) {
            this.updateLookUp[id] = {}
        }
        this.updateLookUp[id][updateCopy.prop] = updateCopy.value        
    })

    snapshot.updateEntities.optimized.forEach(batch => {
        //this.updatedEntityIds.push(batch[this.config.ID_PROPERTY_NAME])

        var entity = this.entities.get(batch[this.config.ID_PROPERTY_NAME])
        batch.updates.forEach(update => {
            if (update.isDelta) {
                var value = getValue(entity, update.path)
                setValue(entity, update.path, value + update.value)
                //entity[update.prop] += update.value
            } else {
                setValue(entity, update.path, update.value)
                //entity[update.prop] = update.value
            }

            this.updateEntities.push({ 
                [this.config.ID_PROPERTY_NAME]: batch[this.config.ID_PROPERTY_NAME], 
                prop: update.prop,
                path: update.path,
                value: entity[update.prop]
            })           
        })
    })

    snapshot.deleteEntities.forEach(id => {
        this.deleteEntities.push(id)
        this.entities.removeById(id)
    })
}

export default WorldState;