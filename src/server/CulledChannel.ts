import { LocalState } from './LocalState'
import { ICulledChannel, VisibilityResolver } from './IChannel'
import { User } from './User'
import { Channel } from './Channel'
import { IEntity } from '../common/IEntity'

export class CulledChannel<VisibleObjectType, ViewType> implements ICulledChannel<VisibleObjectType, ViewType> {
    private channel: Channel
    private views: Map<number, ViewType> = new Map()
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>

    constructor(localState: LocalState, visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>) {
        this.channel = new Channel(localState)
        this.visibilityResolver = visibilityResolver
    }

    get nid() {
        return this.channel.nid
    }

    get entities() {
        return this.channel.entities
    }

    addEntity(entity: IEntity & VisibleObjectType) {
        return this.channel.addEntity(entity)
    }

    removeEntity(entity: IEntity & VisibleObjectType) {
        return this.channel.removeEntity(entity)
    }

    addMessage(message: any) {
        this.channel.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message)
            }
        })
    }

    subscribe(user: User, view: ViewType) {
        this.channel.subscribe(user)
        this.views.set(user.id, view)
    }

    unsubscribe(user: User) {
        this.channel.unsubscribe(user)
        this.views.delete(user.id)
    }

    getVisibleEntities(userId: number): number[] {
        const view = this.views.get(userId)
        const visibleEntities: number[] = []
        if (view) {
            this.channel.entities.forEach((entity: IEntity) => {
                if (this.visibilityResolver(entity as VisibleObjectType, view)) {
                    visibleEntities.push(entity.nid)
                }
            })
        }
        return visibleEntities
    }

    destroy() {
        this.channel.destroy()
        this.views = new Map()
        this.visibilityResolver = (obj: any, view: any) => { return true }
    }
}
