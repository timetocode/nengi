import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { ChannelHeader, ChannelType, createChannelHeader, hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { IEntity } from '../../common/IEntity'
import { Instance } from '../Instance'
import { LocalState } from '../LocalState'
import { NDictionary } from '../NDictionary'
import { User } from '../User'
import { ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { SpatialGrid2D, SpatialGridCell } from './SpatialGrid'
import { getSpatialPlaneAxes, normalizeSpatialView, objectInSpatialView, SpatialPlane, SpatialPlaneAxes, SpatialView } from './SpatialView'
import { ChannelSnapshotOutput } from './ChannelSnapshotOutput'
import { createCellFragmentChannelOutput } from './CellFragmentChannelOutput'
import {
    appendManualGroup,
    appendManualProp,
    coalesceManualUpdateLog
} from './EcsSpatialManualLog'

type SpatialEntity = IEntity & Record<string, any>
export type Manual2DMove = { entity: SpatialEntity, fromCell: string, toCell: string }
export type Manual2DSnapshotVisibility = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    previous: Set<number>
    visibleCellKeys?: string[]
    group?: Manual2DVisibilityGroup
    nextCellSignature?: string
    nextVisibleRef?: number[]
    nextVisibleSet?: Set<number>
}

const EMPTY_NIDS: number[] = []

type Manual2DVisibilityGroup = {
    cellSignature: string
    visibleCellKeys: string[]
    visibleNids: number[]
    visibleCellKeySet?: Set<string>
    visibleNidSet?: Set<number>
    users: User[]
    stableSnapshot?: Manual2DSnapshotVisibility
}

type Manual2DVisibilityPlan = {
    tick: number
    groups: Manual2DVisibilityGroup[]
    userSnapshots: Map<number, Manual2DSnapshotVisibility>
}

type Manual2DVisibilityState = {
    cellSignature: string
    visibleRef: number[]
    visibleSet: Set<number>
}

export type Manual2DCellLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
    manualOpTypes: number[]
    manualOpIndexes: number[]
    manualNeedsCoalesce: boolean
}

type Cell = SpatialGridCell<SpatialEntity> & Manual2DCellLog

export type Manual2DTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (entity: SpatialEntity, value: any) => void }
    readonly groups: { [name: string]: (entity: SpatialEntity, ...values: any[]) => void }
}

export type ManualChannel2DOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    plane?: SpatialPlane
    spatialProps?: { x?: string, y?: string }
    // Development validation: throw when a writer target cannot be mapped to
    // this channel's spatial entity/root cell.
    validateManualWriteTargets?: boolean
}

function initializeManualCell(cell: SpatialGridCell<SpatialEntity>) {
    const manualCell = cell as Cell
    manualCell.manualPropNids = []
    manualCell.manualPropSchemas = []
    manualCell.manualPropValues = []
    manualCell.manualGroupNids = []
    manualCell.manualGroupSchemas = []
    manualCell.manualGroupValueOffsets = []
    manualCell.manualGroupValues = []
    manualCell.manualOpTypes = []
    manualCell.manualOpIndexes = []
    manualCell.manualNeedsCoalesce = false
}

// ManualChannel2D intentionally mirrors ManualChannel3D instead
// of using a dimension-generic wrapper; this is snapshot hot-path code, so
// benchmark before collapsing the parallel implementations.
export class ManualChannel2D implements ICulledChannel<SpatialEntity, SpatialView> {
    readonly manualCellFragmentChannelMode = true
    readonly cellFragmentMode = true
    nid: number
    localState: LocalState
    entities = new NDictionary()
    users: Map<number, User> = new Map()
    header: ChannelHeader
    headerVersion = 0
    channelType = ChannelType.ManualChannel2D
    visibilityResolver = (obj: any, view: SpatialView) => objectInSpatialView(obj, view, this.plane)
    cellSize: number
    queryPadding: number
    membershipVersion = 0
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    dirtyCells: Set<string> = new Set()
    private views: Map<number, SpatialView> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid2D<SpatialEntity>
    private visibleCellKeyCache: Map<number, { viewVersion: number, keys: string[] }> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, entityTreeVersion: number, nids: number[] }> = new Map()
    private rememberedCells: Map<number, Map<string, number[]>> = new Map()
    private rememberedCellSignatures: Map<number, string> = new Map()
    private spatialXProp: string
    private spatialYProp: string
    plane: SpatialPlane
    private axes: SpatialPlaneAxes
    private validateManualWriteTargets: boolean
    private movedRoots: Manual2DMove[] = []
    private structuralDeltas = false
    private visibilityPlan: Manual2DVisibilityPlan | null = null
    private visibilityStateByUser: Map<number, Manual2DVisibilityState> = new Map()
    private pendingPropEntities: SpatialEntity[] = []
    private pendingPropSchemas: SchemaProp[] = []
    private pendingPropValues: any[] = []
    private pendingGroupEntities: SpatialEntity[] = []
    private pendingGroupSchemas: SchemaUpdateGroup[] = []
    private pendingGroupValueOffsets: number[] = []
    private pendingGroupValues: any[] = []
    private pendingOpTypes: number[] = []
    private pendingOpIndexes: number[] = []
    skipInterpolationNids: number[] = []

    constructor(localState: LocalState, cellSize: number, options: ManualChannel2DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('ManualChannel2D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('ManualChannel2D queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.header = createChannelHeader(this.nid, this.channelType, options.header, options.name)
        this.headerVersion = hasSchemaBackedChannelHeader(this.header) ? 1 : 0
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.plane = options.plane || 'xy'
        this.axes = getSpatialPlaneAxes(this.plane)
        this.spatialXProp = options.spatialProps?.x || this.axes.a
        this.spatialYProp = options.spatialProps?.y || this.axes.b
        this.validateManualWriteTargets = options.validateManualWriteTargets === true
        this.grid = new SpatialGrid2D({
            cellSize,
            getX: entity => entity[this.spatialXProp],
            getY: entity => entity[this.spatialYProp],
            initializeCell: initializeManualCell
        })
        this.localState.channels.add(this as any)
    }

    private getOrCreateCellForEntity(entity: SpatialEntity) {
        return this.grid.getOrCreateCellForObject(entity) as Cell
    }

    private getCellForEntity(entity: SpatialEntity) {
        const ref = this.grid.objectCells.get(entity.nid)
        if (ref) {
            return this.grid.cells.get(ref.key) as Cell || this.getOrCreateCellForEntity(entity)
        }
        return this.getOrCreateCellForEntity(entity)
    }

    private addToCell(entity: SpatialEntity) {
        return this.grid.add(entity.nid, entity).createdCell
    }

    private removeFromCell(entity: SpatialEntity) {
        return this.grid.remove(entity.nid)?.removedCell || false
    }

    private updateSpatialCell(entity: SpatialEntity) {
        const move = this.grid.update(entity.nid, entity)
        if (!move) {
            return
        }

        this.movedRoots.push({ entity, fromCell: move.fromCell, toCell: move.toCell })
        this.membershipVersion++
        if (move.removedCell || move.createdCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
    }

    private validatePendingWriteEntity(entity: SpatialEntity) {
        if (this.grid.objectCells.has(entity.nid)) {
            return true
        }
        const rootNid = this.localState.getRootNid(entity.nid)
        if (rootNid && rootNid !== entity.nid && this.grid.objectCells.has(rootNid)) {
            return true
        }
        if (this.validateManualWriteTargets) {
            throw new Error(`ManualChannel2D cannot write mutation for nid ${entity.nid}; no spatial cell was found for the entity or its root.`)
        }
        return false
    }

    private getCellForPendingWrite(entity: SpatialEntity) {
        let ref = this.grid.objectCells.get(entity.nid)
        if (ref) {
            this.updateSpatialCell(entity)
            ref = this.grid.objectCells.get(entity.nid)
            if (!ref) {
                return null
            }
            this.dirtyCells.add(ref.key)
            return this.grid.cells.get(ref.key) as Cell
        }

        const rootNid = this.localState.getRootNid(entity.nid)
        if (rootNid && rootNid !== entity.nid) {
            const rootRef = this.grid.objectCells.get(rootNid)
            if (rootRef) {
                this.dirtyCells.add(rootRef.key)
                return this.grid.cells.get(rootRef.key) as Cell
            }
        }

        if (this.validateManualWriteTargets) {
            throw new Error(`ManualChannel2D cannot write mutation for nid ${entity.nid}; no spatial cell was found for the entity or its root.`)
        }
        return null
    }

    private appendPendingProp(entity: SpatialEntity, prop: SchemaProp, value: any) {
        if (!this.validatePendingWriteEntity(entity)) {
            return
        }
        this.pendingOpTypes.push(0)
        this.pendingOpIndexes.push(this.pendingPropEntities.length)
        this.pendingPropEntities.push(entity)
        this.pendingPropSchemas.push(prop)
        this.pendingPropValues.push(value)
        this.clearVisibilityPlan()
    }

    private appendPendingGroup(entity: SpatialEntity, group: SchemaUpdateGroup, values: IArguments | any[], valueOffset = 0) {
        if (!this.validatePendingWriteEntity(entity)) {
            return
        }
        this.pendingOpTypes.push(1)
        this.pendingOpIndexes.push(this.pendingGroupEntities.length)
        this.pendingGroupEntities.push(entity)
        this.pendingGroupSchemas.push(group)
        this.pendingGroupValueOffsets.push(this.pendingGroupValues.length)
        for (let i = 0; i < group.props.length; i++) {
            this.pendingGroupValues.push(values[i + valueOffset])
        }
        this.clearVisibilityPlan()
    }

    private clearPendingWrites() {
        this.pendingPropEntities.length = 0
        this.pendingPropSchemas.length = 0
        this.pendingPropValues.length = 0
        this.pendingGroupEntities.length = 0
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

        for (let i = 0; i < this.pendingOpTypes.length; i++) {
            const index = this.pendingOpIndexes[i]
            if (this.pendingOpTypes[i] === 0) {
                const entity = this.pendingPropEntities[index]
                const cell = this.getCellForPendingWrite(entity)
                if (cell) {
                    appendManualProp(cell, entity.nid, this.pendingPropSchemas[index], this.pendingPropValues[index])
                }
                continue
            }

            const entity = this.pendingGroupEntities[index]
            const cell = this.getCellForPendingWrite(entity)
            if (!cell) {
                continue
            }
            const group = this.pendingGroupSchemas[index]
            const offset = this.pendingGroupValueOffsets[index]
            appendManualGroup(cell, entity.nid, group, this.pendingGroupValues, offset)
        }
        this.clearPendingWrites()
    }

    private invalidateVisibleEntityCache() {
        this.visibleEntityCache.clear()
        this.visibleNetworkedNidsCache.clear()
        this.clearVisibilityPlan()
    }

    private invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear()
        this.invalidateVisibleEntityCache()
    }

    private clearVisibilityPlan() {
        this.visibilityPlan = null
    }

    private getGroupVisibleCellSet(group: Manual2DVisibilityGroup) {
        if (!group.visibleCellKeySet) {
            group.visibleCellKeySet = new Set(group.visibleCellKeys)
        }
        return group.visibleCellKeySet
    }

    private getGroupVisibleSet(group: Manual2DVisibilityGroup) {
        if (!group.visibleNidSet) {
            group.visibleNidSet = new Set(group.visibleNids)
        }
        return group.visibleNidSet
    }

    private hasVisibilityCellMove(group: Manual2DVisibilityGroup) {
        if (this.movedRoots.length === 0) {
            return false
        }

        const visibleCells = this.getGroupVisibleCellSet(group)
        for (let i = 0; i < this.movedRoots.length; i++) {
            const move = this.movedRoots[i]
            if (visibleCells.has(move.fromCell) !== visibleCells.has(move.toCell)) {
                return true
            }
        }
        return false
    }

    private collectUserSnapshotFromGroup(user: User, group: Manual2DVisibilityGroup): Manual2DSnapshotVisibility {
        const state = this.visibilityStateByUser.get(user.id)
        if (state && state.visibleRef === group.visibleNids) {
            if (!group.stableSnapshot) {
                group.stableSnapshot = {
                    toCreate: EMPTY_NIDS,
                    toUpdate: EMPTY_NIDS,
                    toDelete: EMPTY_NIDS,
                    previous: state.visibleSet,
                    visibleCellKeys: group.visibleCellKeys,
                    group,
                    nextCellSignature: group.cellSignature,
                    nextVisibleRef: group.visibleNids,
                    nextVisibleSet: state.visibleSet
                }
            }
            return group.stableSnapshot
        }

        if (state && state.cellSignature === group.cellSignature && !this.hasVisibilityCellMove(group)) {
            if (!group.stableSnapshot) {
                group.stableSnapshot = {
                    toCreate: EMPTY_NIDS,
                    toUpdate: EMPTY_NIDS,
                    toDelete: EMPTY_NIDS,
                    previous: state.visibleSet,
                    visibleCellKeys: group.visibleCellKeys,
                    group,
                    nextCellSignature: group.cellSignature,
                    nextVisibleRef: group.visibleNids,
                    nextVisibleSet: state.visibleSet
                }
            }
            return group.stableSnapshot
        }

        const currentSet = this.getGroupVisibleSet(group)
        if (!state) {
            return {
                toCreate: group.visibleNids.slice(),
                toUpdate: EMPTY_NIDS,
                toDelete: EMPTY_NIDS,
                previous: new Set<number>(),
                visibleCellKeys: group.visibleCellKeys,
                group,
                nextCellSignature: group.cellSignature,
                nextVisibleRef: group.visibleNids,
                nextVisibleSet: currentSet
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

        const previous = state.visibleSet
        return {
            toCreate,
            toUpdate: EMPTY_NIDS,
            toDelete,
            previous,
            visibleCellKeys: group.visibleCellKeys,
            group,
            nextCellSignature: group.cellSignature,
            nextVisibleRef: group.visibleNids,
            nextVisibleSet: currentSet
        }
    }

    private viewRange(view: SpatialView) {
        const spatialView = normalizeSpatialView(view, this.plane)
        const halfWidth = spatialView.halfA + this.queryPadding
        const halfHeight = spatialView.halfB + this.queryPadding
        const startX = spatialView.a - halfWidth
        const startY = spatialView.b - halfHeight
        const endX = spatialView.a + halfWidth
        const endY = spatialView.b + halfHeight

        return {
            minX: this.grid.cellCoord(startX),
            maxX: this.grid.cellCoordForEnd(endX),
            minY: this.grid.cellCoord(startY),
            maxY: this.grid.cellCoordForEnd(endY)
        }
    }

    private buildVisibleCells(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        const nids: number[] = []
        if (!view) {
            return { keys, nids }
        }

        const spatialView = normalizeSpatialView(view, this.plane)
        const visibleKeys = spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInCircle(spatialView.a, spatialView.b, spatialView.radius + this.queryPadding) :
            this.grid.getVisibleCellKeys(this.viewRange(view))
        for (let i = 0; i < visibleKeys.length; i++) {
            const key = visibleKeys[i]
            const cell = this.grid.cells.get(key)
            if (!cell) {
                continue
            }
            keys.push(key)
            for (let j = 0; j < cell.ids.length; j++) {
                nids.push(cell.ids[j])
            }
        }

        return { keys, nids }
    }

    private getCellDeleteNids(key: string) {
        const nids: number[] = []
        const cell = this.grid.cells.get(key)
        if (!cell) {
            return nids
        }

        for (let i = 0; i < cell.ids.length; i++) {
            this.localState.collectEntityTreeDeletes(cell.ids[i], nids)
        }
        return nids
    }

    createEntityWriter(ntype: number, schema: Schema): Manual2DTypeWriters {
        const props: Manual2DTypeWriters['props'] = Object.create(null)
        const groups: Manual2DTypeWriters['groups'] = Object.create(null)
        const writers: Manual2DTypeWriters = {
            ntype,
            schema,
            props,
            groups
        }
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
            props[name] = (entity: SpatialEntity, value: any) => {
                this.appendPendingProp(entity, prop, value)
            }
            addAlias(name, props[name])
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = (entity: SpatialEntity, v0: any) => {
                    this.appendPendingGroup(entity, group, [v0])
                }
            } else if (group.props.length === 2) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any) => {
                    this.appendPendingGroup(entity, group, [v0, v1])
                }
            } else if (group.props.length === 3) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any, v2: any) => {
                    this.appendPendingGroup(entity, group, [v0, v1, v2])
                }
            } else if (group.props.length === 4) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any, v2: any, v3: any) => {
                    this.appendPendingGroup(entity, group, [v0, v1, v2, v3])
                }
            } else {
                groups[group.name] = (entity: SpatialEntity, ...values: any[]) => {
                    this.appendPendingGroup(entity, group, values)
                }
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

    addEntity(entity: SpatialEntity) {
        this.localState.registerEntity(entity, this.nid)
        this.entities.add(entity)
        this.addToCell(entity)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleCellKeyCache()
        return entity
    }

    syncHeader() {
        if (!hasSchemaBackedChannelHeader(this.header)) {
            return false
        }
        this.headerVersion++
        return true
    }

    moveEntity(entity: SpatialEntity) {
        this.updateSpatialCell(entity)
    }

    removeEntity(entity: SpatialEntity) {
        const nid = entity.nid
        if (this.entities.get(nid) !== entity) {
            return 0
        }
        const removedCell = this.removeFromCell(entity)
        this.entities.remove(entity)
        this.localState.unregisterEntity(entity, this.nid)
        this.membershipVersion++
        this.structuralDeltas = true
        if (removedCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
        return nid
    }

    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity as SpatialEntity))
    }

    // One-frame interpolation skip for teleports, respawns, wraparound, or
    // pooled entities moved discontinuously to a new position.
    skipInterpolation(entity: SpatialEntity) {
        if (!entity || entity.nid === 0 || this.entities.get(entity.nid) !== entity) {
            return false
        }
        this.skipInterpolationNids.push(entity.nid)
        return true
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

    clearBroadcastMessages() {
    }

    clearSnapshotDeltas() {
        this.clearPendingWrites()
        for (const key of this.dirtyCells) {
            const cell = this.grid.cells.get(key) as Cell
            if (!cell) {
                continue
            }
            cell.manualPropNids.length = 0
            cell.manualPropSchemas.length = 0
            cell.manualPropValues.length = 0
            cell.manualGroupNids.length = 0
            cell.manualGroupSchemas.length = 0
            cell.manualGroupValueOffsets.length = 0
            cell.manualGroupValues.length = 0
            cell.manualOpTypes.length = 0
            cell.manualOpIndexes.length = 0
            cell.manualNeedsCoalesce = false
        }
        this.dirtyCells.clear()
        this.skipInterpolationNids.length = 0
        this.movedRoots.length = 0
        this.structuralDeltas = false
    }

    subscribe(user: User, view: SpatialView) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: SpatialView) {
        if (!this.users.has(user.id)) {
            return
        }
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, (this.viewVersions.get(user.id) || 0) + 1)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleEntityCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.viewVersions.delete(user.id)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleEntityCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
        this.rememberedCells.delete(user.id)
        this.rememberedCellSignatures.delete(user.id)
        this.visibilityStateByUser.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this as any)
        this.clearVisibilityPlan()
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleCellKeys(userId: number) {
        this.flushPendingWrites()
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellKeyCache.get(userId)
        if (cached && cached.viewVersion === viewVersion) {
            return cached.keys
        }

        const visible = this.buildVisibleCells(userId)
        this.visibleCellKeyCache.set(userId, {
            viewVersion,
            keys: visible.keys
        })
        return visible.keys
    }

    getVisibleCellKeySignature(userId: number) {
        return this.getVisibleCellKeys(userId).join('|')
    }

    getVisibleEntities(userId: number) {
        this.flushPendingWrites()
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleEntityCache.get(userId)
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids
        }

        const visible = this.buildVisibleCells(userId)
        this.visibleEntityCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            nids: visible.nids
        })
        return visible.nids
    }

    getVisibleNetworkedNids(userId: number) {
        this.flushPendingWrites()
        const entityTreeVersion = this.localState.entityTreeVersion
        const roots = this.getVisibleEntities(userId)
        if (entityTreeVersion === 0) {
            return roots
        }

        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleNetworkedNidsCache.get(userId)
        if (
            cached &&
            cached.viewVersion === viewVersion &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion
        ) {
            return cached.nids
        }

        const nids: number[] = []
        for (let i = 0; i < roots.length; i++) {
            this.localState.collectEntityTree(roots[i], nids)
        }
        this.visibleNetworkedNidsCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            entityTreeVersion,
            nids
        })
        return nids
    }

    getCellEntities(key: string) {
        return this.grid.cells.get(key)?.objects || []
    }

    getCellEntityNids(key: string) {
        return this.grid.cells.get(key)?.ids || []
    }

    getCellVersion(key: string) {
        return this.grid.cells.get(key)?.version || 0
    }

    getManualCellUpdateLog(key: string) {
        this.flushPendingWrites()
        const cell = this.grid.cells.get(key) as Cell
        if (!cell) {
            return null
        }
        if (cell.manualPropNids.length === 0 && cell.manualGroupNids.length === 0) {
            return null
        }
        coalesceManualUpdateLog(cell)
        return cell
    }

    cellHasManualUpdates(key: string) {
        return this.getManualCellUpdateLog(key) !== null
    }

    getMovedRoots() {
        return this.movedRoots
    }

    hasStructuralDeltas() {
        return this.structuralDeltas
    }

    private getVisibleCellVersionSignature(userId: number) {
        const keys = this.getVisibleCellKeys(userId)
        let signature = ''
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            signature += `${key}:${this.getCellVersion(key)}|`
        }
        return signature
    }

    getRememberedCellKeys(userId: number) {
        return Array.from(this.rememberedCells.get(userId)?.keys() || [])
    }

    getRememberedCellNids(userId: number, key: string) {
        return this.rememberedCells.get(userId)?.get(key) || []
    }

    collectSnapshotVisibility(userId: number): Manual2DSnapshotVisibility {
        const previous = new Set<number>()
        const previousCellKeys = this.getRememberedCellKeys(userId)
        for (let i = 0; i < previousCellKeys.length; i++) {
            const nids = this.getRememberedCellNids(userId, previousCellKeys[i])
            for (let j = 0; j < nids.length; j++) {
                previous.add(nids[j])
            }
        }

        const currentNids = this.getVisibleNetworkedNids(userId)
        const current = new Set(currentNids)
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []
        for (let i = 0; i < currentNids.length; i++) {
            const nid = currentNids[i]
            if (previous.has(nid)) {
                toUpdate.push(nid)
            } else {
                toCreate.push(nid)
            }
        }
        previous.forEach(nid => {
            if (!current.has(nid)) {
                toDelete.push(nid)
            }
        })
        return { toCreate, toUpdate, toDelete, previous }
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

        const groups: Manual2DVisibilityGroup[] = []
        const userSnapshots = new Map<number, Manual2DSnapshotVisibility>()
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
        if (this.structuralDeltas) {
            return null
        }
        const plan = this.prepareVisibilityPlan(tick)
        return plan.userSnapshots.get(user.id) || null
    }

    getStableVisibleCellKeys(userId: number) {
        const remembered = this.rememberedCells.get(userId)
        if (!remembered) {
            return null
        }

        const keys = this.getVisibleCellKeys(userId)
        if (this.rememberedCellSignatures.get(userId) !== this.getVisibleCellVersionSignature(userId)) {
            return null
        }
        if (remembered.size !== keys.length) {
            return null
        }
        for (let i = 0; i < keys.length; i++) {
            if (!remembered.has(keys[i])) {
                return null
            }
        }
        return keys
    }

    rememberVisibleCells(userId: number) {
        const remembered = new Map<string, number[]>()
        const keys = this.getVisibleCellKeys(userId)
        for (let i = 0; i < keys.length; i++) {
            remembered.set(keys[i], this.getCellDeleteNids(keys[i]))
        }
        this.rememberedCells.set(userId, remembered)
        this.rememberedCellSignatures.set(userId, this.getVisibleCellVersionSignature(userId))
    }

    rememberSnapshotVisibility(userId: number, visibility?: Manual2DSnapshotVisibility) {
        this.rememberVisibleCells(userId)
        if (visibility?.nextCellSignature && visibility.nextVisibleRef && visibility.nextVisibleSet) {
            this.visibilityStateByUser.set(userId, {
                cellSignature: visibility.nextCellSignature,
                visibleRef: visibility.nextVisibleRef,
                visibleSet: visibility.nextVisibleSet
            })
            return
        }
        const visibleRef = this.getVisibleNetworkedNids(userId)
        this.visibilityStateByUser.set(userId, {
            cellSignature: this.getVisibleCellKeySignature(userId),
            visibleRef,
            visibleSet: new Set(visibleRef)
        })
    }

    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig): ChannelSnapshotOutput {
        return createCellFragmentChannelOutput(user, instance, this, protocol)
    }

    destroy() {
        this.unsubscribeAll()
        this.removeAllEntities()
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this as any)
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleEntityCache.clear()
        this.visibleNetworkedNidsCache.clear()
        this.dirtyCells.clear()
        this.rememberedCells.clear()
        this.rememberedCellSignatures.clear()
        this.visibilityStateByUser.clear()
        this.clearVisibilityPlan()
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.visibilityResolver = () => true
    }
}
