import { ChannelType } from '../../common/ChannelHeader'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { FinalStateSpatialChannel2D, FinalStateSpatialChannel2DOptions } from './FinalStateSpatialChannel2D'

export type PlannedSpatialUserSnapshot = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    group: PlannedSpatialVisibilityGroup
}

export type PlannedSpatialVisibilityGroup = {
    cellSignature: string
    visibleNids: number[]
    visibleNidSet?: Set<number>
    updatedVisibleNids: number[]
    users: User[]
    stableSnapshot?: PlannedSpatialUserSnapshot
    sharedUpdateFragment?: {
        payload: any
        bytes: number
        updateProps: number
        updateGroups: number
        groupedUpdateProps: number
    }
}

const EMPTY_NIDS: number[] = []

export type PlannedSpatialVisibilityPlan = {
    tick: number
    groups: PlannedSpatialVisibilityGroup[]
    userSnapshots: Map<number, PlannedSpatialUserSnapshot>
}

type PlannedSpatialVisibilityState = {
    visibleRef: number[]
    visibleSet: Set<number>
}

export class PlannedSpatialChannel2D extends FinalStateSpatialChannel2D {
    readonly plannedSpatialChannelMode = true
    private visibilityPlan: PlannedSpatialVisibilityPlan | null = null
    private visibilityStateByUser: Map<number, PlannedSpatialVisibilityState> = new Map()
    private updatedNids: Set<number> = new Set()

    constructor(localState: LocalState, cellSize: number, options: FinalStateSpatialChannel2DOptions = {}) {
        super(localState, cellSize, { ...options, channelType: ChannelType.PlannedSpatialChannel2D })
    }

    private clearVisibilityPlan() {
        this.visibilityPlan = null
    }

    private filterUpdatedVisibleNids(nids: number[]) {
        if (this.updatedNids.size === 0) {
            return []
        }
        if (this.updatedNids.size >= this.entities.size) {
            return nids
        }
        const updated: number[] = []
        for (let i = 0; i < nids.length; i++) {
            if (this.updatedNids.has(nids[i])) {
                updated.push(nids[i])
            }
        }
        return updated
    }

    private getGroupVisibleSet(group: PlannedSpatialVisibilityGroup) {
        if (!group.visibleNidSet) {
            group.visibleNidSet = new Set(group.visibleNids)
        }
        return group.visibleNidSet
    }

    private collectUserSnapshotFromGroup(
        user: User,
        tick: number,
        group: PlannedSpatialVisibilityGroup
    ): PlannedSpatialUserSnapshot {
        if (group.users.length === 1) {
            return this.collectSingletonUserSnapshot(user, tick, group)
        }

        const state = this.visibilityStateByUser.get(user.id)
        if (state && state.visibleRef === group.visibleNids) {
            if (!group.stableSnapshot) {
                group.stableSnapshot = {
                    toCreate: EMPTY_NIDS,
                    toUpdate: group.updatedVisibleNids,
                    toDelete: EMPTY_NIDS,
                    group
                }
            }
            return group.stableSnapshot
        }

        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []
        const currentSet = this.getGroupVisibleSet(group)

        if (!state) {
            for (let i = 0; i < group.visibleNids.length; i++) {
                toCreate.push(group.visibleNids[i])
            }
            this.visibilityStateByUser.set(user.id, {
                visibleRef: group.visibleNids,
                visibleSet: currentSet
            })
            this.updateUserVisibilityMirror(user, tick, group.visibleNids)
            return { toCreate, toUpdate, toDelete, group }
        }

        const allUpdated = this.updatedNids.size >= this.entities.size
        for (let i = 0; i < group.visibleNids.length; i++) {
            const nid = group.visibleNids[i]
            if (!state.visibleSet.has(nid)) {
                toCreate.push(nid)
            } else if (allUpdated || this.updatedNids.has(nid)) {
                toUpdate.push(nid)
            }
        }

        for (let i = 0; i < state.visibleRef.length; i++) {
            const nid = state.visibleRef[i]
            if (!currentSet.has(nid)) {
                toDelete.push(nid)
            }
        }

        state.visibleRef = group.visibleNids
        state.visibleSet = currentSet
        this.updateUserVisibilityMirror(user, tick, group.visibleNids)
        return { toCreate, toUpdate, toDelete, group }
    }

    private collectSingletonUserSnapshot(
        user: User,
        tick: number,
        group: PlannedSpatialVisibilityGroup
    ): PlannedSpatialUserSnapshot {
        const { toCreate, toUpdate, toDelete } = user.checkChannelVisibility(this, tick)
        const state = this.visibilityStateByUser.get(user.id)
        if (!state || toCreate.length > 0 || toDelete.length > 0) {
            this.visibilityStateByUser.set(user.id, {
                visibleRef: group.visibleNids,
                visibleSet: this.getGroupVisibleSet(group)
            })
        } else {
            state.visibleRef = group.visibleNids
        }
        return {
            toCreate,
            toUpdate: this.filterUpdatedVisibleNids(toUpdate),
            toDelete,
            group
        }
    }

    private updateUserVisibilityMirror(user: User, tick: number, visibleNids: number[]) {
        user.withChannelVisibilityState(this.nid, () => {
            user.tickLastSeen.clear()
            user.currentlyVisible = visibleNids.slice()
            for (let i = 0; i < visibleNids.length; i++) {
                user.tickLastSeen.set(visibleNids[i], tick)
            }
            user.stableVisibleRefs.set(this.nid, visibleNids)
            user.lastVisibleCount = visibleNids.length
        })
    }

    addEntity(entity: Parameters<FinalStateSpatialChannel2D['addEntity']>[0]) {
        const added = super.addEntity(entity)
        this.clearVisibilityPlan()
        return added
    }

    updateEntity(entity: Parameters<FinalStateSpatialChannel2D['updateEntity']>[0]) {
        if (entity.nid !== 0) {
            this.updatedNids.add(entity.nid)
        }
        const result = super.updateEntity(entity)
        this.clearVisibilityPlan()
        return result
    }

    removeEntity(entity: Parameters<FinalStateSpatialChannel2D['removeEntity']>[0]) {
        if (entity.nid !== 0) {
            this.updatedNids.delete(entity.nid)
        }
        const removed = super.removeEntity(entity)
        this.clearVisibilityPlan()
        return removed
    }

    markDirty(entity: Parameters<FinalStateSpatialChannel2D['markDirty']>[0]) {
        if (entity.nid !== 0) {
            this.updatedNids.add(entity.nid)
            this.clearVisibilityPlan()
        }
        return super.markDirty(entity)
    }

    subscribe(user: User, view?: Parameters<FinalStateSpatialChannel2D['subscribe']>[1]) {
        super.subscribe(user, view)
        this.clearVisibilityPlan()
    }

    updateView(user: User, view: Parameters<FinalStateSpatialChannel2D['updateView']>[1]) {
        super.updateView(user, view)
        this.clearVisibilityPlan()
    }

    unsubscribe(user: User) {
        super.unsubscribe(user)
        this.visibilityStateByUser.delete(user.id)
        this.clearVisibilityPlan()
    }

    prepareVisibilityPlan(tick: number) {
        if (this.visibilityPlan && this.visibilityPlan.tick === tick) {
            return this.visibilityPlan
        }

        const usersByCellSignature = new Map<string, User[]>()
        for (const user of this.users.values()) {
            if (user.hasPendingVisibilityDeletes()) {
                continue
            }
            const signature = this.getVisibleCellKeySignature(user.id)
            let groupUsers = usersByCellSignature.get(signature)
            if (!groupUsers) {
                groupUsers = []
                usersByCellSignature.set(signature, groupUsers)
            }
            groupUsers.push(user)
        }

        const groups: PlannedSpatialVisibilityGroup[] = []
        const userSnapshots = new Map<number, PlannedSpatialUserSnapshot>()
        for (const [cellSignature, groupUsers] of usersByCellSignature) {
            const visibleNids = groupUsers.length > 0 ? super.getVisibleNetworkedNids(groupUsers[0].id) : []
            const group = {
                cellSignature,
                visibleNids,
                updatedVisibleNids: this.filterUpdatedVisibleNids(visibleNids),
                users: groupUsers
            }
            groups.push(group)
            for (let i = 0; i < groupUsers.length; i++) {
                const user = groupUsers[i]
                userSnapshots.set(user.id, this.collectUserSnapshotFromGroup(user, tick, group))
            }
        }

        this.visibilityPlan = { tick, groups, userSnapshots }
        return this.visibilityPlan
    }

    getPlannedSnapshot(user: User, tick: number) {
        const plan = this.prepareVisibilityPlan(tick)
        return plan.userSnapshots.get(user.id) || null
    }

    destroy() {
        this.clearVisibilityPlan()
        this.visibilityStateByUser.clear()
        this.updatedNids.clear()
        super.destroy()
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.updatedNids.clear()
        this.clearVisibilityPlan()
    }
}
