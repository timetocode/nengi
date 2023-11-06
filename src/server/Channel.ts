import { LocalState } from './LocalState'
import { IEntity } from '../common/IEntity'
import { IChannel } from './IChannel'
import { User } from './User'
import { NDictionary } from './NDictionary'

export class Channel implements IChannel {
    nid: number
    localState: LocalState
    entities = new NDictionary()
    users: Map<number, User> = new Map()

    constructor(localState: LocalState) {      
        this.localState = localState
        this.nid = localState.nidPool.nextId()
    }

    addEntity(entity: IEntity) {
        this.localState.registerEntity(entity, this.nid)
        this.entities.add(entity)
        return entity
    }

    removeEntity(entity: IEntity) {
        this.entities.remove(entity)
        this.localState.unregisterEntity(entity, this.nid)
    }

    addMessage(message: any) {
        this.users.forEach(user => user.queueMessage(message))
    }

    subscribe(user: any) {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    unsubscribe(user: any) {
        this.users.delete(user.id)
        user.unsubscribe(this)
    }

    getVisibleEntities(userId: number) {
        const visibleNids: number[] = []
        this.entities.forEach((entity: IEntity) => {
            visibleNids.push(entity.nid)
        })
        return visibleNids        
    }

    destroy() {
        this.users.forEach(user => this.unsubscribe(user))
        for (let i = 0; i < this.entities.array.length; i++) {
            this.removeEntity(this.entities.array[i])
        }
        this.entities.removeAll()
        this.localState.nidPool.returnId(this.nid)
    }
}