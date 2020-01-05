import EDictionary from '../../external/EDictionary'


class Channel {
    constructor(instance, id) {
        if (!instance) {
            throw new Error('Channel constructor must be passed an instance.')
        }
        this.id = id
        this.instance = instance
        this.config = instance.config
        this.entities = new EDictionary(this.config.ID_PROPERTY_NAME)
        this.clients = new Map()
        this.destroyed = false
        //this.instance.channelCount++
        //this.instance.channels.add(this)
    }

    addEntity(entity) {
        if (!entity.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        this.instance.registerEntity(entity, this.id)
        this.entities.add(entity)
        return entity
    }

    removeEntity(entity) {
        //console.log('channel removeEntity', entity[this.config.ID_PROPERTY_NAME])
        this.entities.remove(entity)
        this.instance.unregisterEntity(entity, this.id)
    }

    addMessage(message) {
        //console.log('channel addMessage', message)
        message[this.config.TYPE_PROPERTY_NAME] = this.instance.protocols.getIndex(message.protocol)
        this.clients.forEach(client => {
            client.queueMessage(message)
        })
    }

    subscribe(client) {
        this.clients.set(client.id, client)
        client.subscribe(this)
    }

    unsubscribe(client) {
        this.clients.delete(client)
        client.unsubscribe(this)
    }

    destroy() {
        this.clients.forEach(client => this.unsubscribe(client))
        this.entities.forEach(entity => this.removeEntity(entity))
        this.instance.channels.remove(this)
        this.destroyed = true
        //this.instance.channelCount--
    }
}

export default Channel
