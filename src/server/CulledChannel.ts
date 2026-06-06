import { LocalState } from './LocalState'
import { ICulledChannel, VisibilityResolver } from './IChannel'
import { User } from './User'
import { Channel } from './Channel'
import { IEntity } from '../common/IEntity'
import { Historian } from './Historian'
import { ChannelOptions } from './Channel'

export type CulledChannelOptions = ChannelOptions

export class CulledChannel<VisibleObjectType, ViewType> implements ICulledChannel<VisibleObjectType, ViewType> {
    private channel: Channel
    private views: Map<number, ViewType> = new Map()
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>
    historian: Historian | null = null
    users: Map<number, User> = new Map()

    constructor(localState: LocalState, visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>, options: CulledChannelOptions = {}) {
        this.channel = new Channel(localState, options)
        this.visibilityResolver = visibilityResolver
        if (options.historian) {
            this.historian = options.historian
        }
    }

    get nid() {
        return this.channel.nid
    }

    get label() {
        return this.channel.label
    }

    get clientIdentity() {
        return this.channel.clientIdentity
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

    removeAllEntities() {
        return this.channel.removeAllEntities()
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

    updateView(user: User, view: ViewType) {
        if (!this.users.has(user.id)) {
            return
        }
        this.views.set(user.id, view)
    }

    unsubscribe(user: any) {
        this.views.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleEntities(userId: number): number[] {
        const view = this.views.get(userId)
        const visibleEntities: number[] = []

        if (view) {
            const entities = this.channel.entities.array
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i]
                if (this.visibilityResolver(entity as VisibleObjectType, view)) {
                    visibleEntities.push(entity.nid)
                }
            }
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
