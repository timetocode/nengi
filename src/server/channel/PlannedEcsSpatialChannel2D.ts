import { ChannelType } from '../../common/ChannelHeader'
import { IEntity } from '../../common/IEntity'
import { LocalState } from '../LocalState'
import { User } from '../User'
import {
    EcsSpatial2DComponent,
    EcsSpatialChannel2D,
    EcsSpatialChannel2DOptions
} from './EcsSpatialChannel2D'
import { SpatialView } from './SpatialView'

const EMPTY_NIDS: number[] = []

export type PlannedEcsSpatialUserSnapshot = {
    toCreate: number[]
    toDelete: number[]
    group: PlannedEcsSpatialVisibilityGroup
}

export type PlannedEcsSpatialVisibilityGroup = {
    cellSignature: string
    visibleCellKeys: string[]
    visibleNids: number[]
    visibleNidSet?: Set<number>
    users: User[]
    stableSnapshot?: PlannedEcsSpatialUserSnapshot
    sharedUpdateFragment?: {
        payload: any
        bytes: number
        updateProps: number
        updateGroups: number
        groupedUpdateProps: number
    }
}

export type PlannedEcsSpatialVisibilityPlan = {
    tick: number
    groups: PlannedEcsSpatialVisibilityGroup[]
    userSnapshots: Map<number, PlannedEcsSpatialUserSnapshot>
}

type PlannedEcsSpatialVisibilityState = {
    cellSignature: string
    visibleRef: number[]
    visibleSet: Set<number>
}

type PlannedEcsSpatialCellMove = {
    fromCell: string
    toCell: string
}

export class PlannedEcsSpatialChannel2D extends EcsSpatialChannel2D {
    readonly plannedEcsSpatialChannelMode = true
    channelType = ChannelType.PlannedEcsSpatialChannel2D
    private visibilityPlan: PlannedEcsSpatialVisibilityPlan | null = null
    private visibilityStateByUser: Map<number, PlannedEcsSpatialVisibilityState> = new Map()
    private movedRootCells: PlannedEcsSpatialCellMove[] = []

    constructor(localState: LocalState, cellSize: number, options: EcsSpatialChannel2DOptions = {}) {
        super(localState, cellSize, options)
        this.channelType = ChannelType.PlannedEcsSpatialChannel2D
        this.header.channelType = ChannelType.PlannedEcsSpatialChannel2D
    }

    private clearVisibilityPlan() {
        this.visibilityPlan = null
    }

    private getGroupVisibleSet(group: PlannedEcsSpatialVisibilityGroup) {
        if (!group.visibleNidSet) {
            group.visibleNidSet = new Set(group.visibleNids)
        }
        return group.visibleNidSet
    }

    private collectUserSnapshotFromGroup(
        user: User,
        group: PlannedEcsSpatialVisibilityGroup
    ): PlannedEcsSpatialUserSnapshot {
        const state = this.visibilityStateByUser.get(user.id)
        if (state && state.visibleRef === group.visibleNids) {
            if (!group.stableSnapshot) {
                group.stableSnapshot = {
                    toCreate: EMPTY_NIDS,
                    toDelete: EMPTY_NIDS,
                    group
                }
            }
            return group.stableSnapshot
        }

        if (state &&
            state.cellSignature === group.cellSignature &&
            !this.hasLifecycleDeltas() &&
            !this.hasVisibilityCellMove(group)) {
            state.visibleRef = group.visibleNids
            if (!group.stableSnapshot) {
                group.stableSnapshot = {
                    toCreate: EMPTY_NIDS,
                    toDelete: EMPTY_NIDS,
                    group
                }
            }
            return group.stableSnapshot
        }

        const currentSet = this.getGroupVisibleSet(group)
        if (!state) {
            this.visibilityStateByUser.set(user.id, {
                cellSignature: group.cellSignature,
                visibleRef: group.visibleNids,
                visibleSet: currentSet
            })
            return {
                toCreate: group.visibleNids.slice(),
                toDelete: EMPTY_NIDS,
                group
            }
        }

        const toCreate: number[] = []
        const toDelete: number[] = []
        for (let i = 0; i < group.visibleNids.length; i++) {
            const nid = group.visibleNids[i]
            if (!state.visibleSet.has(nid)) {
                toCreate.push(nid)
            }
        }
        for (let i = 0; i < state.visibleRef.length; i++) {
            const nid = state.visibleRef[i]
            if (!currentSet.has(nid)) {
                toDelete.push(nid)
            }
        }

        state.cellSignature = group.cellSignature
        state.visibleRef = group.visibleNids
        state.visibleSet = currentSet
        return { toCreate, toDelete, group }
    }

    getVisibleCellKeySignature(userId: number) {
        return this.getVisibleCellKeys(userId).join('|')
    }

    private hasLifecycleDeltas() {
        return this.createdRoots.length > 0 ||
            this.deletedRoots.length > 0 ||
            this.createdComponents.length > 0 ||
            this.deletedComponents.length > 0 ||
            this.rootDeletedComponents.length > 0
    }

    private hasVisibilityCellMove(group: PlannedEcsSpatialVisibilityGroup) {
        if (this.movedRootCells.length === 0) {
            return false
        }
        const visibleCells = new Set(group.visibleCellKeys)
        for (let i = 0; i < this.movedRootCells.length; i++) {
            const move = this.movedRootCells[i]
            if (visibleCells.has(move.fromCell) !== visibleCells.has(move.toCell)) {
                return true
            }
        }
        return false
    }

    protected onRootCellMove(pid: number, fromCell: string, toCell: string) {
        this.movedRootCells.push({ fromCell, toCell })
    }

    addEntity() {
        const nid = super.addEntity()
        this.clearVisibilityPlan()
        return nid
    }

    createEntity() {
        const nid = super.createEntity()
        this.clearVisibilityPlan()
        return nid
    }

    removeEntity(pidOrEntity: number | IEntity) {
        const removed = super.removeEntity(pidOrEntity)
        this.clearVisibilityPlan()
        return removed
    }

    addComponent<T extends { nid: number, ntype: number }>(
        pid: number,
        component: T,
        options: { spatial?: boolean } = {}
    ): T & EcsSpatial2DComponent {
        const added = super.addComponent(pid, component, options)
        this.clearVisibilityPlan()
        return added
    }

    addSpatialComponent<T extends { nid: number, ntype: number }>(pid: number, component: T) {
        const added = super.addSpatialComponent(pid, component)
        this.clearVisibilityPlan()
        return added
    }

    removeComponent(componentOrNid: EcsSpatial2DComponent | number) {
        super.removeComponent(componentOrNid)
        this.clearVisibilityPlan()
    }

    setSpatialComponent(pid: number, componentOrNid: EcsSpatial2DComponent | number) {
        super.setSpatialComponent(pid, componentOrNid)
        this.clearVisibilityPlan()
    }

    updateSpatialComponent(componentOrNid: EcsSpatial2DComponent | number) {
        super.updateSpatialComponent(componentOrNid)
        this.clearVisibilityPlan()
    }

    subscribe(user: User, view: SpatialView) {
        super.subscribe(user, view)
        this.clearVisibilityPlan()
    }

    updateView(user: User, view: SpatialView) {
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
            const signature = this.getVisibleCellKeySignature(user.id)
            let groupUsers = usersByCellSignature.get(signature)
            if (!groupUsers) {
                groupUsers = []
                usersByCellSignature.set(signature, groupUsers)
            }
            groupUsers.push(user)
        }

        const groups: PlannedEcsSpatialVisibilityGroup[] = []
        const userSnapshots = new Map<number, PlannedEcsSpatialUserSnapshot>()
        for (const [cellSignature, groupUsers] of usersByCellSignature) {
            const first = groupUsers[0]
            const visibleCellKeys = first ? this.getVisibleCellKeys(first.id) : []
            const visibleNids = first ? this.getVisibleNetworkedNids(first.id) : []
            const group = {
                cellSignature,
                visibleCellKeys,
                visibleNids,
                users: groupUsers
            }
            groups.push(group)
            for (let i = 0; i < groupUsers.length; i++) {
                const user = groupUsers[i]
                userSnapshots.set(user.id, this.collectUserSnapshotFromGroup(user, group))
            }
        }

        this.visibilityPlan = { tick, groups, userSnapshots }
        return this.visibilityPlan
    }

    getPlannedSnapshot(user: User, tick: number) {
        const plan = this.prepareVisibilityPlan(tick)
        return plan.userSnapshots.get(user.id) || null
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.movedRootCells.length = 0
        this.clearVisibilityPlan()
    }

    destroy() {
        this.clearVisibilityPlan()
        this.visibilityStateByUser.clear()
        this.movedRootCells.length = 0
        super.destroy()
    }
}
