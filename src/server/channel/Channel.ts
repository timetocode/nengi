import { IEntity } from '../../common/IEntity'
import { Historian } from '../Historian'
import { LocalState } from '../LocalState'
import { NDictionary } from '../NDictionary'
import { User } from '../User'
import { IObjectChannel } from './IChannel'

export type ChannelOptions = {
    historian?: Historian
    header?: IEntity
    /**
     * Developer-defined label for debugging, logs, tests, or game tooling.
     * Nengi does not interpret this value or send it over the network.
     */
    label?: string
}

export class Channel implements IObjectChannel {
    nid: number
    label?: string
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
    header: IEntity | null = null
    headerVersion = 0
    private visibleNetworkedNidsCache: { membershipVersion: number, entityTreeVersion: number, nids: number[] } | null = null

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.label = options.label
        if (options.historian) {
            this.historian = options.historian
        }
        this.localState.channels.add(this)
        if (options.header) {
            this.setHeader(options.header)
        }
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

    setHeader(header: IEntity) {
        if (this.header !== null && this.header !== header) {
            throw new Error('Channel header is already set. Mutate the existing header and call markHeaderDirty().')
        }
        if (this.header === header) {
            return header
        }
        this.localState.registerEntity(header, this.nid)
        this.header = header
        this.headerVersion++
        return header
    }

    getHeader() {
        return this.header
    }

    markHeaderDirty() {
        if (!this.header) {
            return false
        }
        this.headerVersion++
        return true
    }

    removeEntity(entity: IEntity) {
        const nid = entity.nid
        if (this.entities.get(nid) !== entity) {
            return 0
        }
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
        return nid
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

    subscribe(user: User) {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    unsubscribe(user: User) {
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
        const cached = this.visibleNetworkedNidsCache
        if (
            cached &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion
        ) {
            return cached.nids
        }

        // Return a versioned snapshot, not the mutable entityNids array. A
        // same-length remove+add must produce a fresh ref so User visibility
        // cannot mistake the new membership for stable updates.
        const nids: number[] = []
        if (entityTreeVersion === 0) {
            for (let i = 0; i < this.entityNids.length; i++) {
                nids.push(this.entityNids[i])
            }
        } else {
            for (let i = 0; i < this.entityNids.length; i++) {
                this.localState.collectEntityTree(this.entityNids[i], nids)
            }
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
        if (this.header) {
            this.localState.unregisterEntity(this.header, this.nid)
            this.header = null
            this.headerVersion++
        }
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this)
    }
}
