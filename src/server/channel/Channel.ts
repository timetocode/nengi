import { IEntity } from '../../common/IEntity'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { ChannelHeader, ChannelHeaderInput, ChannelType, createChannelHeader, hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { Instance } from '../Instance'
import { LocalState } from '../LocalState'
import { NDictionary } from '../NDictionary'
import { User } from '../User'
import { createChannelOutput } from './ChannelOutput'
import { IObjectChannel } from './IChannel'

export type ChannelOptions = {
    header?: ChannelHeaderInput
    name?: string
    channelType?: ChannelType
}

export type ChannelSnapshotVisibility = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    visibleRef: number[]
    visibleSet?: Set<number>
    hasPrevious: boolean
    previousMembershipVersion: number
}

type RememberedChannelVisibility = {
    visibleRef: number[]
    visibleSet?: Set<number>
    membershipVersion: number
}

export class Channel implements IObjectChannel {
    nid: number
    localState: LocalState
    entities = new NDictionary()
    entityNids: number[] = []
    membershipVersion = 0
    deltaBaseVersion = 0
    createdRoots: IEntity[] = []
    deletedNids: number[] = []
    skipInterpolationNids: number[] = []
    broadcastMessages: any[] = []
    interpolatedBroadcastMessages: any[] = []
    users: Map<number, User> = new Map()
    header: ChannelHeader
    headerVersion = 0
    channelType: ChannelType
    private visibleNetworkedNidsCache: { membershipVersion: number, entityTreeVersion: number, nids: number[] } | null = null
    private channelSnapshotVisibilityByUser: Map<number, RememberedChannelVisibility> = new Map()

    constructor(localState: LocalState, options: ChannelOptions = {}) {
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.channelType = options.channelType ?? ChannelType.Channel
        this.header = createChannelHeader(this.nid, this.channelType, options.header, options.name)
        this.headerVersion = hasSchemaBackedChannelHeader(this.header) ? 1 : 0
        this.localState.channels.add(this)
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

    syncHeader() {
        if (!hasSchemaBackedChannelHeader(this.header)) {
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

    // One-frame interpolation skip for teleports, respawns, wraparound, or
    // pooled entities moved discontinuously to a new position.
    skipInterpolation(entity: IEntity) {
        if (!entity || entity.nid === 0 || this.entities.get(entity.nid) !== entity) {
            return false
        }
        this.skipInterpolationNids.push(entity.nid)
        return true
    }

    addMessage(message: any) {
        this.broadcastMessages.push(message)
    }

    addInterpolatedMessage(message: any) {
        this.interpolatedBroadcastMessages.push(message)
    }

    clearBroadcastMessages() {
        this.broadcastMessages.length = 0
        this.interpolatedBroadcastMessages.length = 0
    }

    clearSnapshotDeltas() {
        this.createdRoots.length = 0
        this.deletedNids.length = 0
        this.skipInterpolationNids.length = 0
        this.deltaBaseVersion = this.membershipVersion
    }

    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig) {
        return createChannelOutput(user, instance, this, protocol)
    }

    collectChannelSnapshotVisibility(userOrId: User | number): ChannelSnapshotVisibility {
        const userId = typeof userOrId === 'number' ? userOrId : userOrId.id
        const visibleRef = this.getVisibleNetworkedNids(userId)
        const previous = this.channelSnapshotVisibilityByUser.get(userId)
        if (previous && previous.visibleRef === visibleRef) {
            return {
                toCreate: [],
                toUpdate: visibleRef.slice(),
                toDelete: [],
                visibleRef,
                visibleSet: previous.visibleSet,
                hasPrevious: true,
                previousMembershipVersion: previous.membershipVersion
            }
        }

        const visibleSet = new Set(visibleRef)
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []
        if (!previous) {
            toCreate.push(...visibleRef)
        } else {
            const previousVisibleSet = previous.visibleSet ?? new Set(previous.visibleRef)
            for (let i = 0; i < visibleRef.length; i++) {
                const nid = visibleRef[i]
                if (previousVisibleSet.has(nid)) {
                    toUpdate.push(nid)
                } else {
                    toCreate.push(nid)
                }
            }
            previousVisibleSet.forEach(nid => {
                if (!visibleSet.has(nid)) {
                    toDelete.push(nid)
                }
            })
        }
        return {
            toCreate,
            toUpdate,
            toDelete,
            visibleRef,
            visibleSet,
            hasPrevious: !!previous,
            previousMembershipVersion: previous?.membershipVersion || 0
        }
    }

    collectChannelSharedDeltaVisibility(userOrId: User | number): ChannelSnapshotVisibility | null {
        if (this.createdRoots.length === 0 && this.deletedNids.length === 0) {
            return null
        }

        const userId = typeof userOrId === 'number' ? userOrId : userOrId.id
        const previous = this.channelSnapshotVisibilityByUser.get(userId)
        if (!previous || previous.membershipVersion !== this.deltaBaseVersion) {
            return null
        }

        return {
            toCreate: [],
            toUpdate: [],
            toDelete: [],
            visibleRef: this.getVisibleNetworkedNids(userId),
            hasPrevious: true,
            previousMembershipVersion: previous.membershipVersion
        }
    }

    rememberChannelSnapshotVisibility(userId: number, visibility: ChannelSnapshotVisibility) {
        this.channelSnapshotVisibilityByUser.set(userId, {
            visibleRef: visibility.visibleRef,
            visibleSet: visibility.visibleSet,
            membershipVersion: this.membershipVersion
        })
    }

    subscribe(user: User) {
        this.users.set(user.id, user)
        user.subscribe(this)
    }

    unsubscribe(user: User) {
        this.users.delete(user.id)
        this.channelSnapshotVisibilityByUser.delete(user.id)
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
        void userId
        // Plain channels are all-visible; returning the maintained nid list
        // avoids rebuilding identical arrays for every subscribed user.
        return this.entityNids
    }

    getVisibleNetworkedNids(userId: number) {
        void userId
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
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this)
        this.channelSnapshotVisibilityByUser.clear()
    }
}
