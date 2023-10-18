import { LocalState } from './LocalState'
import { IEntity } from '../common/IEntity'
import { IChannel } from './IChannel'
import { User } from './User'

export class Channel implements IChannel {
    nid: number = 0
    ntype: number = 0
    localState: LocalState
    channelEntity: IEntity
    users: Map<number, User> = new Map()

    constructor(localState: LocalState, ntype: number) {
        this.channelEntity = { nid: 0, ntype }
        localState.addEntity(this.channelEntity)

        this.nid = this.channelEntity.nid
        this.localState = localState  
    }

    addEntity(entity: IEntity) {
        this.localState.addChild(entity, this.channelEntity)
        return entity
    }

    removeEntity(entity: IEntity) {
        this.localState.removeEntity(entity)
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

    getVisibileEntities(userId: number) {
        return [this.channelEntity.nid, ...this.localState.children.get(this.channelEntity.nid)!]
    }

    destroy() {
        this.users.forEach(user => user.unsubscribe(this))
        this.localState.removeEntity(this.channelEntity)
    }
}
