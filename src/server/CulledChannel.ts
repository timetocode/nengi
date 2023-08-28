import { EDictionary } from './EDictionary'
import { LocalState } from './LocalState'
import { IEntity } from '../common/IEntity'
import { ICulledChannel, CulledChannelSubscriptionHandler, VisibilityResolver } from './IChannel'
import { User } from './User'

export class CulledChannel<VisibleObjectType, ViewType> implements ICulledChannel<VisibleObjectType, ViewType> {
    id: number
    localState: LocalState
    entities: EDictionary
    users: Map<number, User>
    views: Map<number, ViewType>

    onSubscribe: CulledChannelSubscriptionHandler
    onUnsubscribe: CulledChannelSubscriptionHandler
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>

    constructor(localState: LocalState) {
        this.id = 0
        this.localState = localState
        this.entities = new EDictionary()
        this.users = new Map()
        this.views = new Map()

        this.onSubscribe = (user: User, channel: ICulledChannel<VisibleObjectType, ViewType>) => { }
        this.onUnsubscribe = (user: User, channel: ICulledChannel<VisibleObjectType, ViewType>) => { }
        this.visibilityResolver = (object: VisibleObjectType, view: ViewType) => { return true }
    }

    addEntity(entity: IEntity) {
        this.localState.registerEntity(entity, this.id)
        this.entities.add(entity)
        return entity
    }

    removeEntity(entity: IEntity) {
        this.entities.remove(entity)
        this.localState.unregisterEntity(entity, this.id)
    }

    addMessage(message: any) {
        this.users.forEach(user => {
            if (this.visibilityResolver(message, this.views.get(user.id)!)) {
                user.queueMessage(message)
            }
        })
    }

    subscribe(user: any, view: ViewType) {
        this.users.set(user.id, user)
        this.views.set(user.id, view)
        user.subscribe(this)
        this.onSubscribe(user, this)
    }

    unsubscribe(user: any) {
        this.onUnsubscribe(user, this)
        this.users.delete(user.id)
        this.views.delete(user.id)
        user.unsubscribe(this)
    }

    getVisibileEntities(userId: number) {
        const view = this.views.get(userId)!
        const visibleNids: number[] = []
        this.entities.forEach((entity: any) => {
            if (this.visibilityResolver(entity, view)) {
                visibleNids.push(entity.nid)
            }
        })
        return visibleNids
    }

    destroy() {
        this.users.forEach(user => this.unsubscribe(user))
        this.entities.forEach(entity => this.removeEntity(entity))
    }
}
