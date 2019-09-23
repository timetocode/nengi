import EDictionary from '../../external/EDictionary'
import Instance from './Instance'

class Channel {
    constructor(instance) {
		if (!instance || !(instance instanceof Instance)) {
			throw new Error('Channel constructor must be passed an instance.')
		}
		this.instance = instance
		this.config = instance.config
        this.entities = new EDictionary(this.config.ID_PROPERTY_NAME)
        this.clients = new Map()
        this.messages = []

        this.entityIdPool = null
        this.protocols = null        
    }

    addEntity(entity) {
        if (!entity.protocol) {
            throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        }
        entity[this.config.ID_PROPERTY_NAME] = this.instance.entityIdPool.nextId()
        entity[this.config.TYPE_PROPERTY_NAME] = this.instance.protocols.getIndex(entity.protocol)
        this.entities.add(entity)
        //console.log('entity added to channel', entity.id)
        if (!this.instance._entities.get(entity[this.instance.config.ID_PROPERTY_NAME])) {
            this.instance._entities.add(entity)
        }

        this.clients.forEach(client => {
            client.addCreate(entity[this.config.ID_PROPERTY_NAME])
        })
        return entity
    }

    removeEntity(entity) {
        this.entities.remove(entity)
        this.instance._entities.remove(entity)
        this.entityIdPool.queueReturnId(entity[this.config.ID_PROPERTY_NAME])
        entity[this.config.ID_PROPERTY_NAME] = -1
    }

    addMessage(message) {
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
}

export default Channel