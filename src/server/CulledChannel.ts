import { LocalState } from './LocalState'
import { ICulledChannel, VisibilityResolver } from './IChannel'
import { User } from './User'
import { Channel } from './Channel'
import { IEntity } from '../common/IEntity'
import { Historian } from './Historian'

export class CulledChannel<VisibleObjectType, ViewType> implements ICulledChannel<VisibleObjectType, ViewType> {
    private channel: Channel
    private views: Map<number, ViewType> = new Map()
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>
    historian: Historian | null = null
    users: Map<number, User> = new Map()

    constructor(localState: LocalState, visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>, historian?: Historian) {
        this.channel = new Channel(localState, historian)
        this.visibilityResolver = visibilityResolver
        if (historian) {
            this.historian = historian
        }
    }

    get nid() {
        return this.channel.nid
    }

    get entities() {
        return this.channel.entities
    }

    tick(tick: number) {
        if (this.historian !== null) {
            this.historian.record(tick, this.channel.entities)
        }
    }

    addEntity(entity: IEntity & VisibleObjectType) {
        return this.channel.addEntity(entity)
    }

    removeEntity(entity: IEntity & VisibleObjectType) {
        return this.channel.removeEntity(entity)
    }

    addMessage(message: any) {
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message)
            }
        })
    }

    subscribe(user: any, view: ViewType) {
        this.views.set(user.id, view)
        this.users.set(user.id, user)
        user.subscribe(this)

    }

    unsubscribe(user: any) {
        this.views.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this)
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
        this.users.forEach(user => this.unsubscribe(user))
        this.channel.destroy()
        this.views = new Map()
        this.visibilityResolver = (obj: any, view: any) => { return true }
    }
}
