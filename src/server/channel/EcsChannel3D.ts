import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { ChannelHeader, ChannelHeaderInput, ChannelType, createChannelHeader, hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { IEntity } from '../../common/IEntity'
import { Instance } from '../Instance'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { SpatialGrid3D, SpatialGridCell } from './SpatialGrid'
import { normalizeSpatialView3D, objectInSpatialView3D, SpatialView3D } from './SpatialView'
import {
    appendEcsSpatialManualProp,
    appendManualGroup,
    clearEcsSpatialManualUpdateLog,
    coalesceEcsSpatialManualUpdateLog,
    createEcsSpatialManualUpdateLog,
    EcsSpatialManualUpdateLog
} from './EcsSpatialManualLog'
import { EcsSpatialEntityStore } from './EcsSpatialEntityStore'
import {
    EcsChannelUserSnapshot,
    EcsChannelVisibilityGroup,
    EcsChannelVisibilityPlan
} from './EcsChannel2D'
import { ChannelSnapshotOutput } from './ChannelSnapshotOutput'
import { createEcsCulledChannelOutput } from './EcsChannelSnapshot'

export type Ecs3DComponent = IEntity & { pid: number }

export type Ecs3DUpdateLog = EcsSpatialManualUpdateLog

type Cell = SpatialGridCell<Ecs3DComponent> & Ecs3DUpdateLog

export type Ecs3DTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (component: Ecs3DComponent, value: any) => void }
    readonly groups: { [name: string]: (component: Ecs3DComponent, ...values: any[]) => void }
}

export type EcsChannel3DOptions = {
    name?: string
    header?: ChannelHeaderInput
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    spatialProps?: { x?: string, y?: string, z?: string }
    // Development validation: throw when a component writer target cannot be
    // mapped to this channel's spatial root cell.
    validateManualWriteTargets?: boolean
}

function createUpdateLog(): Ecs3DUpdateLog {
    return createEcsSpatialManualUpdateLog()
}

function initializeEcsSpatialCell(cell: SpatialGridCell<Ecs3DComponent>) {
    Object.assign(cell, createUpdateLog())
}

const EMPTY_NIDS: number[] = []

type EcsChannelVisibilityState = {
    cellSignature: string
    visibleRef: number[]
    visibleSet: Set<number>
}

type EcsChannelCellMove = {
    fromCell: string
    toCell: string
}

/**
 * Culled 3D ECS channel with manual mutation emission. Userland must call the
 * component writers for networked updates; nengi does not autodiff component state.
 */
export class EcsChannel3D {
    readonly ecsCulledChannelMode = true
    readonly ecsChannelMode = true
    nid: number
    localState: LocalState
    users: Map<number, User> = new Map()
    header: ChannelHeader
    headerVersion = 0
    channelType = ChannelType.EcsChannel3D
    visibilityResolver = objectInSpatialView3D
    cellSize: number
    queryPadding: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    membershipVersion = 0
    skipInterpolationNids: number[] = []
    dirtyCells: Set<string> = new Set()
    private entities: EcsSpatialEntityStore<Ecs3DComponent>
    private views: Map<number, SpatialView3D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid3D<Ecs3DComponent>
    private visibleCellKeyCache: Map<number, { viewVersion: number, membershipVersion: number, keys: string[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private structuralDeltas = false
    private spatialXProp: string
    private spatialYProp: string
    private spatialZProp: string
    private validateManualWriteTargets: boolean
    private visibilityPlan: EcsChannelVisibilityPlan | null = null
    private visibilityStateByUser: Map<number, EcsChannelVisibilityState> = new Map()
    private movedRootCells: EcsChannelCellMove[] = []
    private pendingPropComponents: Ecs3DComponent[] = []
    private pendingPropSchemas: SchemaProp[] = []
    private pendingPropValues: any[] = []
    private pendingGroupComponents: Ecs3DComponent[] = []
    private pendingGroupNTypes: number[] = []
    private pendingGroupSchemas: SchemaUpdateGroup[] = []
    private pendingGroupValueOffsets: number[] = []
    private pendingGroupValues: any[] = []
    private pendingOpTypes: number[] = []
    private pendingOpIndexes: number[] = []

    constructor(localState: LocalState, cellSize: number, options: EcsChannel3DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('EcsChannel3D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('EcsChannel3D queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.entities = new EcsSpatialEntityStore(localState)
        this.header = createChannelHeader(this.nid, this.channelType, options.header, options.name)
        this.headerVersion = hasSchemaBackedChannelHeader(this.header) ? 1 : 0
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.spatialXProp = options.spatialProps?.x || 'x'
        this.spatialYProp = options.spatialProps?.y || 'y'
        this.spatialZProp = options.spatialProps?.z || 'z'
        this.validateManualWriteTargets = options.validateManualWriteTargets === true
        this.grid = new SpatialGrid3D({
            cellSize,
            getX: component => component[this.spatialXProp],
            getY: component => component[this.spatialYProp],
            getZ: component => component[this.spatialZProp],
            initializeCell: initializeEcsSpatialCell
        })
        this.localState.channels.add(this as any)
    }

    get rootNids() { return this.entities.rootNids }
    get componentNids() { return this.entities.componentNids }
    get createdRoots() { return this.entities.createdRoots }
    get deletedEntities() { return this.entities.deletedEntities }
    get createdComponents() { return this.entities.createdComponents }
    get deletedComponents() { return this.entities.deletedComponents }

    private addRootToCell(pid: number, component: Ecs3DComponent) {
        return this.grid.add(pid, component).createdCell
    }

    private removeRootFromCell(pid: number) {
        return this.grid.remove(pid)?.removedCell || false
    }

    private updateRootCell(pid: number) {
        const component = this.entities.getSpatialComponent(pid)
        if (!component) {
            return
        }

        const move = this.grid.update(pid, component)
        if (!move) {
            return
        }
        this.onRootCellMove(pid, move.fromCell, move.toCell)
        this.membershipVersion++
        this.structuralDeltas = true
        if (move.removedCell || move.createdCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleNetworkedNidsCache()
        }
        this.onChannelStateChanged()
    }

    private clearVisibilityPlan() {
        this.visibilityPlan = null
    }

    private getGroupVisibleSet(group: EcsChannelVisibilityGroup) {
        if (!group.visibleNidSet) {
            group.visibleNidSet = new Set(group.visibleNids)
        }
        return group.visibleNidSet
    }

    private collectUserSnapshotFromGroup(
        user: User,
        group: EcsChannelVisibilityGroup
    ): EcsChannelUserSnapshot {
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
            this.deletedEntities.length > 0 ||
            this.createdComponents.length > 0 ||
            this.deletedComponents.length > 0
    }

    private hasVisibilityCellMove(group: EcsChannelVisibilityGroup) {
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

    private onRootCellMove(pid: number, fromCell: string, toCell: string) {
        this.movedRootCells.push({ fromCell, toCell })
    }

    private onChannelStateChanged() {
        this.clearVisibilityPlan()
    }

    private onUserUnsubscribed(user: User) {
        this.visibilityStateByUser.delete(user.id)
    }

    private invalidateVisibleNetworkedNidsCache() {
        this.visibleNetworkedNidsCache.clear()
    }

    private invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear()
        this.invalidateVisibleNetworkedNidsCache()
    }

    private viewRange(view: SpatialView3D) {
        const spatialView = normalizeSpatialView3D(view)
        const halfWidth = spatialView.halfWidth + this.queryPadding
        const halfHeight = spatialView.halfHeight + this.queryPadding
        const halfDepth = spatialView.halfDepth + this.queryPadding
        return {
            minX: this.grid.cellCoord(spatialView.x - halfWidth),
            maxX: this.grid.cellCoordForEnd(spatialView.x + halfWidth),
            minY: this.grid.cellCoord(spatialView.y - halfHeight),
            maxY: this.grid.cellCoordForEnd(spatialView.y + halfHeight),
            minZ: this.grid.cellCoord(spatialView.z - halfDepth),
            maxZ: this.grid.cellCoordForEnd(spatialView.z + halfDepth)
        }
    }

    private validatePendingWriteComponent(component: Ecs3DComponent) {
        if (this.grid.objectCells.has(component.pid)) {
            return true
        }
        if (this.validateManualWriteTargets) {
            throw new Error(`EcsChannel3D cannot write mutation for component nid ${component.nid}; no spatial cell was found for pid ${component.pid}.`)
        }
        return false
    }

    private getCellForPendingWrite(component: Ecs3DComponent, updatedPids: Set<number>) {
        const pid = component.pid
        if (!updatedPids.has(pid)) {
            const spatial = this.entities.getSpatialComponent(pid)
            if (spatial) {
                this.updateRootCell(pid)
            }
            updatedPids.add(pid)
        }
        const ref = this.grid.objectCells.get(pid)
        return ref ? this.grid.cells.get(ref.key) as Cell || null : null
    }

    private appendPendingProp(component: Ecs3DComponent, prop: SchemaProp, value: any) {
        if (!this.validatePendingWriteComponent(component)) {
            return
        }
        this.pendingOpTypes.push(0)
        this.pendingOpIndexes.push(this.pendingPropComponents.length)
        this.pendingPropComponents.push(component)
        this.pendingPropSchemas.push(prop)
        this.pendingPropValues.push(value)
        this.onChannelStateChanged()
    }

    private appendPendingGroup(ntype: number, component: Ecs3DComponent, group: SchemaUpdateGroup, values: IArguments | any[], valueOffset = 0) {
        if (!this.validatePendingWriteComponent(component)) {
            return
        }
        this.pendingOpTypes.push(1)
        this.pendingOpIndexes.push(this.pendingGroupComponents.length)
        this.pendingGroupComponents.push(component)
        this.pendingGroupNTypes.push(ntype)
        this.pendingGroupSchemas.push(group)
        this.pendingGroupValueOffsets.push(this.pendingGroupValues.length)
        for (let i = 0; i < group.props.length; i++) {
            this.pendingGroupValues.push(values[i + valueOffset])
        }
        this.onChannelStateChanged()
    }

    private clearPendingWrites() {
        this.pendingPropComponents.length = 0
        this.pendingPropSchemas.length = 0
        this.pendingPropValues.length = 0
        this.pendingGroupComponents.length = 0
        this.pendingGroupNTypes.length = 0
        this.pendingGroupSchemas.length = 0
        this.pendingGroupValueOffsets.length = 0
        this.pendingGroupValues.length = 0
        this.pendingOpTypes.length = 0
        this.pendingOpIndexes.length = 0
    }

    private flushPendingWrites() {
        if (this.pendingOpTypes.length === 0) {
            return
        }

        const updatedPids = new Set<number>()
        for (let i = 0; i < this.pendingOpTypes.length; i++) {
            const index = this.pendingOpIndexes[i]
            if (this.pendingOpTypes[i] === 0) {
                const component = this.pendingPropComponents[index]
                const cell = this.getCellForPendingWrite(component, updatedPids)
                if (cell) {
                    this.dirtyCells.add(cell.key)
                    this.writeManualPropMutation(cell, component, this.pendingPropSchemas[index], this.pendingPropValues[index])
                }
                continue
            }

            const component = this.pendingGroupComponents[index]
            const cell = this.getCellForPendingWrite(component, updatedPids)
            if (!cell) {
                continue
            }
            this.dirtyCells.add(cell.key)
            appendManualGroup(
                cell,
                component.nid,
                this.pendingGroupSchemas[index],
                this.pendingGroupValues,
                this.pendingGroupValueOffsets[index],
                this.pendingGroupNTypes[index]
            )
        }
        this.clearPendingWrites()
    }

    private writeManualPropMutation(cell: Ecs3DUpdateLog, component: Ecs3DComponent, prop: SchemaProp, value: any) {
        appendEcsSpatialManualProp(cell, component.nid, prop, value)
    }

    private buildVisibleCellKeys(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        if (!view) {
            return keys
        }

        const spatialView = normalizeSpatialView3D(view)
        return spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInSphere(spatialView.x, spatialView.y, spatialView.z, spatialView.radius + this.queryPadding) :
            this.grid.getVisibleCellKeys(this.viewRange(view))
    }

    private appendRootNetworkedNids(pid: number, nids: number[]) {
        this.entities.appendRootNetworkedNids(pid, nids)
    }

    createEntity() {
        const nid = this.entities.createEntity()
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleNetworkedNidsCache()
        this.onChannelStateChanged()
        return nid
    }

    /** Returns true only while the root is active in this channel. */
    hasRoot(pid: number) {
        return this.entities.hasRoot(pid)
    }

    hasSpatialComponent(pid: number) {
        return this.entities.getSpatialComponent(pid) !== undefined
    }

    syncHeader() {
        if (!hasSchemaBackedChannelHeader(this.header)) {
            return false
        }
        this.headerVersion++
        return true
    }

    removeEntity(pidOrEntity: number | IEntity) {
        const pid = typeof pidOrEntity === 'number' ? pidOrEntity : pidOrEntity.nid
        if (!this.entities.hasRoot(pid)) {
            return 0
        }

        const components = this.entities.getComponents(pid) || []
        for (let i = components.length - 1; i >= 0; i--) {
            this.removeComponentInternal(components[i])
        }

        const removedCell = this.removeRootFromCell(pid)
        this.entities.removeEntityRecord(pid)
        this.membershipVersion++
        this.structuralDeltas = true
        if (removedCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleNetworkedNidsCache()
        }
        this.onChannelStateChanged()
        return pid
    }

    removeAllEntities() {
        const roots = this.rootNids.slice()
        for (let i = 0; i < roots.length; i++) {
            this.removeEntity(roots[i])
        }
    }

    addComponent<T extends IEntity>(pid: number, component: T, options: { spatial?: boolean } = {}): T & Ecs3DComponent {
        const ecsComponent = this.entities.addComponent(pid, component)
        if (options.spatial) {
            this.entities.setSpatialComponent(pid, ecsComponent)
            if (!this.grid.objectCells.has(pid)) {
                this.addRootToCell(pid, ecsComponent)
            } else {
                this.updateRootCell(pid)
            }
        }
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleNetworkedNidsCache()
        this.onChannelStateChanged()
        return ecsComponent
    }

    addSpatialComponent<T extends IEntity>(pid: number, component: T) {
        return this.addComponent(pid, component, { spatial: true })
    }

    private removeComponentInternal(componentOrNid: Ecs3DComponent | number) {
        const removed = this.entities.removeComponent(componentOrNid)
        if (!removed) {
            return
        }
        if (removed.wasSpatial) {
            this.removeRootFromCell(removed.pid)
        }
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleNetworkedNidsCache()
        this.onChannelStateChanged()
    }

    removeComponent(componentOrNid: Ecs3DComponent | number) {
        this.removeComponentInternal(componentOrNid)
    }

    /** @internal Used by the ECS/world binding after it has validated a mutation plan. */
    appendBoundComponentProp(component: Ecs3DComponent, prop: SchemaProp, value: any) {
        if (this.getComponent(component.nid) !== component) {
            throw new Error(`Cannot write an inactive ECS component nid ${component.nid}.`)
        }
        if (!this.grid.objectCells.has(component.pid)) {
            throw new Error(`Cannot write ECS component nid ${component.nid}; root ${component.pid} has no spatial cell.`)
        }
        this.appendPendingProp(component, prop, value)
    }

    /** @internal Used by the ECS/world binding after it has validated a mutation plan. */
    appendBoundComponentGroup(component: Ecs3DComponent, ntype: number, group: SchemaUpdateGroup, values: any[]) {
        if (this.getComponent(component.nid) !== component) {
            throw new Error(`Cannot write an inactive ECS component nid ${component.nid}.`)
        }
        if (!this.grid.objectCells.has(component.pid)) {
            throw new Error(`Cannot write ECS component nid ${component.nid}; root ${component.pid} has no spatial cell.`)
        }
        this.appendPendingGroup(ntype, component, group, values)
    }

    setSpatialComponent(pid: number, componentOrNid: Ecs3DComponent | number) {
        const component = this.entities.setSpatialComponent(pid, componentOrNid)
        if (!this.grid.objectCells.has(pid)) {
            this.addRootToCell(pid, component)
            this.membershipVersion++
            this.structuralDeltas = true
            this.invalidateVisibleCellKeyCache()
            this.onChannelStateChanged()
        } else {
            this.updateRootCell(pid)
        }
    }

    updateSpatialComponent(componentOrNid: Ecs3DComponent | number) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.entities.getComponent(nid)
        if (component) {
            this.updateRootCell(component.pid)
        }
    }

    isRootNid(nid: number) {
        return this.entities.isRootNid(nid)
    }

    isComponentNid(nid: number) {
        return this.entities.isComponentNid(nid)
    }

    getComponent(nid: number) {
        return this.entities.getComponent(nid)
    }

    getVisibleEntities(userId: number) {
        this.flushPendingWrites()
        const roots: number[] = []
        const keys = this.getVisibleCellKeys(userId)
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i])
            if (!cell) {
                continue
            }
            roots.push(...cell.ids)
        }
        return roots
    }

    getVisibleNetworkedNids(userId: number) {
        this.flushPendingWrites()
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleNetworkedNidsCache.get(userId)
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids
        }

        const nids: number[] = []
        const keys = this.getVisibleCellKeys(userId)
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i])
            if (!cell) {
                continue
            }
            for (let j = 0; j < cell.ids.length; j++) {
                this.appendRootNetworkedNids(cell.ids[j], nids)
            }
        }
        this.visibleNetworkedNidsCache.set(userId, { viewVersion, membershipVersion: this.membershipVersion, nids })
        return nids
    }

    getVisibleCellKeys(userId: number) {
        this.flushPendingWrites()
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellKeyCache.get(userId)
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.keys
        }

        const keys = this.buildVisibleCellKeys(userId)
        this.visibleCellKeyCache.set(userId, { viewVersion, membershipVersion: this.membershipVersion, keys })
        return keys
    }

    getCellRootNids(key: string) {
        return this.grid.cells.get(key)?.ids || []
    }

    getManualCellUpdateLog(key: string) {
        this.flushPendingWrites()
        const cell = this.grid.cells.get(key) as Cell
        if (!cell) {
            return null
        }
        coalesceEcsSpatialManualUpdateLog(cell)
        if (cell.manualPropNids.length === 0 && cell.manualGroupNids.length === 0) {
            return null
        }
        return cell
    }

    cellHasManualUpdates(key: string) {
        return this.getManualCellUpdateLog(key) !== null
    }

    hasStructuralDeltas() {
        return this.structuralDeltas
    }

    prepareVisibilityPlan(tick: number) {
        this.flushPendingWrites()
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

        const groups: EcsChannelVisibilityGroup[] = []
        const userSnapshots = new Map<number, EcsChannelUserSnapshot>()
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

    getChannelSnapshot(user: User, tick: number) {
        const plan = this.prepareVisibilityPlan(tick)
        return plan.userSnapshots.get(user.id) || null
    }

    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig): ChannelSnapshotOutput {
        return createEcsCulledChannelOutput(user, instance, this, protocol)
    }

    subscribe(user: User, view: SpatialView3D) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
        this.onChannelStateChanged()
    }

    updateView(user: User, view: SpatialView3D) {
        if (!this.users.has(user.id)) {
            return
        }
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, (this.viewVersions.get(user.id) || 0) + 1)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
        this.onChannelStateChanged()
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.viewVersions.delete(user.id)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this as any)
        this.onUserUnsubscribed(user)
        this.onChannelStateChanged()
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    addMessage(message: any) {
        // Spatial messages are culled immediately against the current user
        // views instead of being stored as channel broadcast fragments.
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueChannelMessage(this.nid, message)
            }
        })
    }

    addInterpolatedMessage(message: any) {
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueChannelInterpolatedMessage(this.nid, message)
            }
        })
    }

    // ECS roots are ids only; skip interpolation is meaningful for stateful
    // components that the client interpolates, such as transform components.
    skipInterpolation(pidOrComponent: number | IEntity) {
        const nid = typeof pidOrComponent === 'number' ? pidOrComponent : pidOrComponent.nid
        if (!this.entities.hasComponent(nid)) {
            return false
        }
        this.skipInterpolationNids.push(nid)
        return true
    }

    clearSnapshotDeltas() {
        this.clearPendingWrites()
        for (const key of this.dirtyCells) {
            const cell = this.grid.cells.get(key) as Cell
            if (cell) {
                clearEcsSpatialManualUpdateLog(cell)
            }
        }
        this.entities.clearSnapshotDeltas()
        this.skipInterpolationNids.length = 0
        this.dirtyCells.clear()
        this.structuralDeltas = false
        this.movedRootCells.length = 0
        this.clearVisibilityPlan()
    }

    destroy() {
        this.clearVisibilityPlan()
        this.visibilityStateByUser.clear()
        this.movedRootCells.length = 0
        this.unsubscribeAll()
        this.removeAllEntities()
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this as any)
        this.dirtyCells.clear()
        this.entities.clear()
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleNetworkedNidsCache.clear()
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.structuralDeltas = false
    }

    createComponentWriter(ntype: number, schema: Schema): Ecs3DTypeWriters {
        const props: Ecs3DTypeWriters['props'] = Object.create(null)
        const groups: Ecs3DTypeWriters['groups'] = Object.create(null)
        const writers: Ecs3DTypeWriters = { ntype, schema, props, groups }

        const aliases = new Set<string>()
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups'])
        const addAlias = (name: string, writer: any) => {
            if (blockedAliases.has(name)) {
                return
            }
            if (aliases.has(name)) {
                delete writers[name]
                blockedAliases.add(name)
                return
            }
            aliases.add(name)
            writers[name] = writer
        }

        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = (component: Ecs3DComponent, value: any) => {
                this.appendPendingProp(component, prop, value)
            }
            addAlias(name, props[name])
        }

        const writeGroup = (component: Ecs3DComponent, group: SchemaUpdateGroup, values: any[]) => {
            this.appendPendingGroup(ntype, component, group, values, 0)
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            groups[group.name] = (component: Ecs3DComponent, ...values: any[]) => {
                writeGroup(component, group, values)
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

}
