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
    /**
     * Optional JSON-serializable identity exposed to subscribed clients. When
     * present, entities created through this channel are tagged with the
     * channel id on the client.
     */
    clientIdentity?: any
}

export class Channel implements IChannel {
    nid: number
    label?: string
    clientIdentity?: any
    localState: LocalState
    entities = new NDictionary()
    entityNids: number[] = []
    membershipVersion = 0
    deltaBaseVersion = 0
    createdRoots: IEntity[] = []
    deletedNids: number[] = []
    broadcastMessages: any[] = []
    users: Map<number, User> = new Map()
    historian: Historian | null = null
    private visibleNetworkedNidsCache: { membershipVersion: number, entityTreeVersion: number, nids: number[] } | null = null

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.label = options.label
        this.clientIdentity = options.clientIdentity
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

    private beginDelta() {
        if (this.createdRoots.length === 0 && this.deletedNids.length === 0) {
            this.deltaBaseVersion = this.membershipVersion
        }
    }

    addEntity(entity: IEntity) {
        this.beginDelta()
        this.localState.registerEntity(entity, this.nid)
        this.entities.add(entity)
        this.entityNids.push(entity.nid)
        this.createdRoots.push(entity)
        this.membershipVersion++
        return entity
    }

    removeEntity(entity: IEntity) {
        const nid = entity.nid
        this.beginDelta()
        const createdIndex = this.createdRoots.findIndex(created => created.nid === nid)
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1)
        } else {
            this.localState.collectEntityTreeDeletes(nid, this.deletedNids)
        }
        this.entities.remove(entity)
        this.localState.unregisterEntity(entity, this.nid)
        const index = this.entityNids.indexOf(nid)
        if (index > -1) {
            this.entityNids.splice(index, 1)
        }
        this.membershipVersion++
    }

    markDirty(entity: IEntity) {
        return this.localState.markDirty(entity)
    }

    addMessage(message: any) {
        this.broadcastMessages.push(message)
    }

    clearBroadcastMessages() {
        this.broadcastMessages.length = 0
    }

    clearSnapshotDeltas() {
        this.createdRoots.length = 0
        this.deletedNids.length = 0
        this.deltaBaseVersion = this.membershipVersion
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
        this.entityNids = []
    }

    getVisibleEntities(userId: number) {
        // Plain channels are all-visible; returning the maintained nid list
        // avoids rebuilding identical arrays for every subscribed user.
        return this.entityNids
    }

    getVisibleNetworkedNids(userId: number) {
        const entityTreeVersion = this.localState.entityTreeVersion
        if (entityTreeVersion === 0) {
            return this.entityNids
        }

        const cached = this.visibleNetworkedNidsCache
        if (
            cached &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion
        ) {
            return cached.nids
        }

        const nids: number[] = []
        for (let i = 0; i < this.entityNids.length; i++) {
            this.localState.collectEntityTree(this.entityNids[i], nids)
        }
        this.visibleNetworkedNidsCache = {
            membershipVersion: this.membershipVersion,
            entityTreeVersion,
            nids
        }
        return nids
    }

    destroy() {
        this.unsubscribeAll()
        this.removeAllEntities()
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this)
    }
}
