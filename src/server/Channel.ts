import { EDictionary } from './EDictionary'
import { LocalState } from './LocalState'
import { IEntity } from '../common/IEntity'
import { IChannel, ChannelSubscriptionHandler } from './IChannel'
import { User } from './User'

export class Channel implements IChannel {
    nid: number
    localState: LocalState
    entities: EDictionary
    users: Map<number, User>
    onSubscribe: ChannelSubscriptionHandler
    onUnsubscribe: ChannelSubscriptionHandler

    constructor(localState: LocalState) {
        this.nid = 0
        this.localState = localState
        this.entities = new EDictionary()
        this.users = new Map()

        this.onSubscribe = (user: User, channel: IChannel) => { }
        this.onUnsubscribe = (user: User, channel: IChannel) => { }
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
        this.onSubscribe(user, this)
    }

    unsubscribe(user: any) {
        this.onUnsubscribe(user, this)
        this.users.delete(user.id)
        user.unsubscribe(this)
    }

    getVisibileEntities(userId: number) {
        const visibleNids: number[] = []
        this.entities.forEach((entity: IEntity) => {
            visibleNids.push(entity.nid)
        })
        return visibleNids
    }

    destroy() {
        this.users.forEach(user => this.unsubscribe(user))
        this.entities.forEachReverse(entity => this.removeEntity(entity))
        this.localState.nidPool.returnId(this.nid)
    }
}