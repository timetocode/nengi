import { LocalState } from './LocalState'
import { IEntity } from '../common/IEntity'
import { IChannel } from './IChannel'
import { User } from './User'
import { NDictionary } from './NDictionary'
import { Historian } from './Historian'

export type ChannelOptions = {
    historian?: Historian
    /**
     * Developer-defined label for debugging, logs, tests, or game tooling.
     * Nengi does not interpret this value or send it over the network.
     */
    label?: string
}

export class Channel implements IChannel {
    nid: number
    label?: string
    localState: LocalState
    entities = new NDictionary()
    users: Map<number, User> = new Map()
    historian: Historian | null = null

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        this.localState = localState
        this.nid = localState.nidPool.nextId()
        this.label = options.label
        if (options.historian) {
            this.historian = options.historian
        }
        this.localState.channels.add(this)
    }

    tick(tick: number) {
        if (this.historian !== null) {
            this.historian.record(tick, this.entities)
        }
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

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity))
        this.entities.removeAll()
    }

    getVisibleEntities(userId: number) {
        const visibleNids: number[] = []
        this.entities.forEach((entity: IEntity) => {
            visibleNids.push(entity.nid)
        })
        return visibleNids
    }

    destroy() {
        this.unsubscribeAll()
        this.removeAllEntities()
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this)
    }
}
