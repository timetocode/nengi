import EntityCache from './EntityCache.js';
import FauxCache from './FauxCache.js';
import LatencyRecord from './LatencyRecord.js';

class Client {
    constructor(config) {
        this.config = config
        this.accepted = false
        this.id = -1
        this.lastReceivedDataTimestamp = Date.now()
        this.lastReceivedTick = -1
        this.lastProcessedClientTick = -1
        this.latencyRecord = new LatencyRecord()

        // websocket connection
        this.connection = null
        // area of the game world visible  to this client
        this.view = { x: 0, y: 0, halfWidth: 400, halfHeight: 300 }
        // entities currently within this client's view
        // used to evaluate changes in visibility
        this.entityIds = []
        this.messageQueue = []
        this.jsonQueue = []
        this.entityCache = new FauxCache() //new EntityCache())

        this.cache = {}
        this.cacheArr = []

        this.channels = []

        this.cr = []
        this.de = []
    }

    get latency() {
        return this.latencyRecord.averageLatency
    }

    addCreate(id) {
        //console.log('entity registered with client', id)
        this.cr.push(id)
    }
    addDelete(id) {
        this.de.push(id)
    }

    subscribe(channel) {
        //console.log('client subscribed to channel')
        this.channels.push(channel)
        channel.entities.forEach(entity => {
            //console.log('entity in channel', entity)
            this.addCreate(entity.id)
        })
    }

    unsubscribe(channel) {
        let index = this.channels.indexOf(channel)
        if (index !== -1) {
            this.channels.splice(index, 1)
        } else {
            // should we throw?
        }
    }

    queueMessage(message) {
        this.messageQueue.push(message)
    }

    queueJSON(json) {
        this.jsonQueue.push(json)
    }

    createOrUpdate(id, tick, toCreate, toUpdate) {
        if (!this.cache[id]) {
            toCreate.push(id)
            this.cache[id] = tick
            this.cacheArr.push(id)
        } else {
            this.cache[id] = tick
            toUpdate.push(id)
        }        

        const children = this.instance.parents.get(id)
 
        if (children) {
            children.forEach(id => this.createOrUpdate(id, tick, toCreate,  toUpdate))
        }
    }

    checkVisibility(spatialStructure, tick) {
        //console.log(this.entityCache)
        const toCreate = []
        const toUpdate = []
        const toDelete = []

        while (this.cr.length > 0) {
            const id = this.cr.shift()
            if (!this.cache[id]) {
                toCreate.push(id)
                this.cache[id] = tick
                this.cacheArr.push(id)
            } else {
                this.cache[id] = tick
                toUpdate.push(id)
            }
        }

        const nearby = spatialStructure.queryArea(this.view)
        // console.log(this.view.x, this.view.y, this.entity.x, this.entity.y, nearby.entities.length)
        const eventIds = []
        for (var i = 0; i < nearby.events.length; i++) {
            eventIds.push(nearby.events[i][this.config.ID_PROPERTY_NAME])
        }

        for (let i = 0; i < nearby.entities.length; i++) {
            const entity = nearby.entities[i]
            const id = entity[this.config.ID_PROPERTY_NAME]
            this.createOrUpdate(id, tick, toCreate, toUpdate)
        }

        this.channels.forEach(channel => {
            channel.entities.forEach(entity => {
                const id = entity[this.config.ID_PROPERTY_NAME]
                this.createOrUpdate(id, tick, toCreate, toUpdate)
            })
        })

        for (let i = this.cacheArr.length - 1; i > -1; i--) {
            const id = this.cacheArr[i]
            if (this.cache[id] !== tick) {
                //console.log('delete', id)
                toDelete.push(id)
                this.cache[id] = 0
                //delete this.cache[id]
                this.cacheArr.splice(i, 1)
            }
        }

        return {
            events: nearby.events,
            noLongerVisible: toDelete, //diffs.aOnly,
            stillVisible: toUpdate,//diffs.both,
            newlyVisible: toCreate//diffs.bOnly
        }
    }

    // saves snapshot state to the client's entity cache
    // ignores events and messages which are not persistent
    saveSnapshot(snapshot, protocols, tick) {
        // no longer saves per client distinct caches
        this.entityCache.saveSnapshot(snapshot, protocols, tick)
    }
}

export default Client