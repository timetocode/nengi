import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { IEntity } from '../../common/IEntity'
import { LocalState } from '../LocalState'
import { NDictionary } from '../NDictionary'
import { User } from '../User'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { SpatialGrid3D, SpatialGridCell } from './SpatialGrid'
import { normalizeSpatialView3D, objectInSpatialView3D, SpatialView3D } from './SpatialView'

type SpatialEntity = IEntity & Record<string, any>
export type ManualSpatial3DMove = { entity: SpatialEntity, fromCell: string, toCell: string }

export type ManualSpatial3DCellLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
}

type Cell = SpatialGridCell<SpatialEntity> & ManualSpatial3DCellLog

export type ManualSpatial3DTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (entity: SpatialEntity, value: any) => void }
    readonly groups: { [name: string]: (entity: SpatialEntity, ...values: any[]) => void }
}

export type ManualSpatialChannel3DOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    spatialProps?: { x?: string, y?: string, z?: string }
    debugManualWrites?: boolean
}

function initializeManualSpatialCell(cell: SpatialGridCell<SpatialEntity>) {
    const manualCell = cell as Cell
    manualCell.manualPropNids = []
    manualCell.manualPropSchemas = []
    manualCell.manualPropValues = []
    manualCell.manualGroupNids = []
    manualCell.manualGroupSchemas = []
    manualCell.manualGroupValueOffsets = []
    manualCell.manualGroupValues = []
}

// ManualSpatialChannel3D intentionally mirrors ManualSpatialChannel2D instead
// of using a dimension-generic wrapper; this is snapshot hot-path code, so
// benchmark before collapsing the parallel implementations.
export class ManualSpatialChannel3D implements ICulledChannel<SpatialEntity, SpatialView3D> {
    readonly manualSpatialChannelMode = true
    readonly cellFragmentMode = true
    nid: number
    label?: string
    localState: LocalState
    entities = new NDictionary()
    users: Map<number, User> = new Map()
    header: IEntity | null = null
    headerVersion = 0
    visibilityResolver = objectInSpatialView3D
    cellSize: number
    queryPadding: number
    membershipVersion = 0
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    dirtyCells: Set<string> = new Set()
    private views: Map<number, SpatialView3D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid3D<SpatialEntity>
    private visibleCellKeyCache: Map<number, { viewVersion: number, keys: string[] }> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, entityTreeVersion: number, nids: number[] }> = new Map()
    private rememberedCells: Map<number, Map<string, number[]>> = new Map()
    private rememberedCellSignatures: Map<number, string> = new Map()
    private spatialXProp: string
    private spatialYProp: string
    private spatialZProp: string
    private debugManualWrites: boolean
    private movedRoots: ManualSpatial3DMove[] = []
    private structuralDeltas = false

    constructor(localState: LocalState, cellSize: number, options: ManualSpatialChannel3DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('ManualSpatialChannel3D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('ManualSpatialChannel3D queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.label = options.label
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.spatialXProp = options.spatialProps?.x || 'x'
        this.spatialYProp = options.spatialProps?.y || 'y'
        this.spatialZProp = options.spatialProps?.z || 'z'
        this.debugManualWrites = options.debugManualWrites === true
        this.grid = new SpatialGrid3D({
            cellSize,
            getX: entity => entity[this.spatialXProp],
            getY: entity => entity[this.spatialYProp],
            getZ: entity => entity[this.spatialZProp],
            initializeCell: initializeManualSpatialCell
        })
        this.localState.channels.add(this as any)
        if (options.header) {
            this.setHeader(options.header)
        }
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

    private markCellDirtyForEntity(entity: SpatialEntity) {
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

        if (this.debugManualWrites) {
            throw new Error(`ManualSpatialChannel3D cannot write mutation for nid ${entity.nid}; no spatial cell was found for the entity or its root.`)
        }
        return null
    }

    private invalidateVisibleEntityCache() {
        this.visibleEntityCache.clear()
        this.visibleNetworkedNidsCache.clear()
    }

    private invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear()
        this.invalidateVisibleEntityCache()
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

    private buildVisibleCells(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        const nids: number[] = []
        if (!view) {
            return { keys, nids }
        }

        const spatialView = normalizeSpatialView3D(view)
        const visibleKeys = spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInSphere(spatialView.x, spatialView.y, spatialView.z, spatialView.radius + this.queryPadding) :
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

    createEntityWriter(ntype: number, schema: Schema): ManualSpatial3DTypeWriters {
        const props: ManualSpatial3DTypeWriters['props'] = Object.create(null)
        const groups: ManualSpatial3DTypeWriters['groups'] = Object.create(null)
        const writers: ManualSpatial3DTypeWriters = {
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
                const cell = this.markCellDirtyForEntity(entity)
                if (!cell) {
                    return
                }
                cell.manualPropNids.push(entity.nid)
                cell.manualPropSchemas.push(prop)
                cell.manualPropValues.push(value)
            }
            addAlias(name, props[name])
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            if (group.props.length === 1) {
                groups[group.name] = (entity: SpatialEntity, v0: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.manualGroupNids.push(entity.nid)
                    cell.manualGroupSchemas.push(group)
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length)
                    cell.manualGroupValues.push(v0)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.manualGroupNids.push(entity.nid)
                    cell.manualGroupSchemas.push(group)
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length)
                    cell.manualGroupValues.push(v0, v1)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any, v2: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.manualGroupNids.push(entity.nid)
                    cell.manualGroupSchemas.push(group)
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length)
                    cell.manualGroupValues.push(v0, v1, v2)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any, v2: any, v3: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.manualGroupNids.push(entity.nid)
                    cell.manualGroupSchemas.push(group)
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length)
                    cell.manualGroupValues.push(v0, v1, v2, v3)
                }
            } else {
                groups[group.name] = (entity: SpatialEntity, ...values: any[]) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.manualGroupNids.push(entity.nid)
                    cell.manualGroupSchemas.push(group)
                    cell.manualGroupValueOffsets.push(cell.manualGroupValues.length)
                    for (let j = 0; j < group.props.length; j++) {
                        cell.manualGroupValues.push(values[j])
                    }
                }
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

    tick(tick: number) {
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

    updateEntity(entity: SpatialEntity) {
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

    addMessage(message: any) {
        // Spatial messages are culled immediately against the current user
        // views instead of being stored as channel broadcast fragments.
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message)
            }
        })
    }

    clearBroadcastMessages() {
    }

    clearSnapshotDeltas() {
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
        }
        this.dirtyCells.clear()
        this.movedRoots.length = 0
        this.structuralDeltas = false
    }

    subscribe(user: User, view: SpatialView3D) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: SpatialView3D) {
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
        this.users.delete(user.id)
        user.unsubscribe(this as any)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleCellKeys(userId: number) {
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

    getVisibleEntities(userId: number) {
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
        const cell = this.grid.cells.get(key) as Cell
        if (!cell) {
            return null
        }
        if (cell.manualPropNids.length === 0 && cell.manualGroupNids.length === 0) {
            return null
        }
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

    destroy() {
        this.unsubscribeAll()
        this.removeAllEntities()
        if (this.header) {
            this.localState.unregisterEntity(this.header, this.nid)
            this.header = null
            this.headerVersion++
        }
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
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.visibilityResolver = () => true
    }
}
