import EDictionary from './EDictionary'
import LocalState from './LocalState'
import IEntity from '../common/IEntity'
import IChannel from './IChannel'


class Channel implements IChannel {
    id: number
    localState: LocalState
    entities: EDictionary
    users: Map<any, any> // TODO
    destroyed: boolean // TODO is this used?

    constructor(localState: LocalState, id: number) {
        this.id = id
        this.localState = localState
        this.entities = new EDictionary()
        this.users = new Map()
        this.destroyed = false
    }

    addEntity(entity: IEntity) {
        // TODO
        //if (!entity.protocol) {
        //    throw new Error('Object is missing a protocol or protocol was not supplied via config.')
        //}
        this.localState.registerEntity(entity, this.id)
        this.entities.add(entity)

        //console.log('added', entity)
        return entity
    }

    removeEntity(entity: IEntity) {
        //console.log('channel removeEntity', entity[this.config.ID_PROPERTY_NAME])
        this.entities.remove(entity)
        this.localState.unregisterEntity(entity, this.id)
    }

    addMessage(message: any) {
        //console.log('channel addMessage', message)
        //message[this.config.TYPE_PROPERTY_NAME] = this.instance.protocols.getIndex(message.protocol)
        this.users.forEach(user => {
            user.queueMessage(message)
        })
    }

    // TODO
    subscribe(user: any) {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    // TODO
    unsubscribe(user: any) {
        this.users.delete(user)
        user.unsubscribe(this)
    }

    getVisible(userId: number): number[] {
        const visibleNids: number[] = []
        this.entities.forEach(entity => {
            visibleNids.push(entity.nid)
        })
        return visibleNids
    }

    destroy() {
        this.users.forEach(user => this.unsubscribe(user))
        this.entities.forEach(entity => this.removeEntity(entity))
        //this.instance.channels.remove(this)
        this.destroyed = true
        //this.instance.channelCount--
    }
}

export { Channel }
