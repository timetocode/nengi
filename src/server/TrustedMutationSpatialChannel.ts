import { Schema, SchemaProp, SchemaUpdateGroup } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'
import { AABB2D } from './AABB2D'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { LocalState } from './LocalState'
import { NDictionary } from './NDictionary'
import { Point2D } from './Point2D'
import { User } from './User'

type SpatialEntity = IEntity & Point2D
type CellRef = { key: string, index: number }
export type TrustedSpatialMove = { entity: SpatialEntity, fromCell: string, toCell: string }

export type TrustedSpatialCellLog = {
    trustedPropNids: number[]
    trustedPropSchemas: SchemaProp[]
    trustedPropValues: any[]
    trustedGroupNids: number[]
    trustedGroupSchemas: SchemaUpdateGroup[]
    trustedGroupValueOffsets: number[]
    trustedGroupValues: any[]
}

type Cell = TrustedSpatialCellLog & {
    key: string
    x: number
    y: number
    entities: SpatialEntity[]
    entityNids: number[]
    version: number
}

export type TrustedSpatialTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (entity: SpatialEntity, value: any) => void }
    readonly groups: { [name: string]: (entity: SpatialEntity, ...values: any[]) => void }
}

export type TrustedMutationSpatialChannelOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    spatialProps?: { x?: string, y?: string }
}

function pointInAABB2D(p: Point2D, view: AABB2D) {
    const startX = view.x - view.halfWidth
    const startY = view.y - view.halfHeight
    const endX = view.x + view.halfWidth
    const endY = view.y + view.halfHeight

    return (
        p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY
    )
}

function createCell(key: string, x: number, y: number): Cell {
    return {
        key,
        x,
        y,
        entities: [],
        entityNids: [],
        version: 0,
        trustedPropNids: [],
        trustedPropSchemas: [],
        trustedPropValues: [],
        trustedGroupNids: [],
        trustedGroupSchemas: [],
        trustedGroupValueOffsets: [],
        trustedGroupValues: []
    }
}

export class TrustedMutationSpatialChannel implements ICulledChannel<Point2D, AABB2D> {
    readonly trustedMutationSpatialMode = true
    readonly cellFragmentMode = true
    nid: number
    label?: string
    clientIdentity?: any
    localState: LocalState
    entities = new NDictionary()
    users: Map<number, User> = new Map()
    visibilityResolver = pointInAABB2D
    cellSize: number
    queryPadding: number
    membershipVersion = 0
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    dirtyCells: Set<string> = new Set()
    private views: Map<number, AABB2D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private cells: Map<string, Cell> = new Map()
    private entityCells: Map<number, CellRef> = new Map()
    private visibleCellKeyCache: Map<number, { viewVersion: number, keys: string[] }> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, entityTreeVersion: number, nids: number[] }> = new Map()
    private rememberedCells: Map<number, Map<string, number[]>> = new Map()
    private rememberedCellSignatures: Map<number, string> = new Map()
    private spatialXProp: string
    private spatialYProp: string
    private movedRoots: TrustedSpatialMove[] = []
    private structuralDeltas = false

    constructor(localState: LocalState, cellSize: number, options: TrustedMutationSpatialChannelOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('TrustedMutationSpatialChannel requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('TrustedMutationSpatialChannel queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.label = options.label
        this.clientIdentity = options.clientIdentity
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.spatialXProp = options.spatialProps?.x || 'x'
        this.spatialYProp = options.spatialProps?.y || 'y'
        this.localState.channels.add(this as any)
    }

    private cellCoord(value: number) {
        return Math.floor(value / this.cellSize)
    }

    private cellCoordForEnd(value: number) {
        return Math.ceil(value / this.cellSize) - 1
    }

    private cellKey(x: number, y: number) {
        return `${x}:${y}`
    }

    private cellKeyForPoint(point: Point2D) {
        return this.cellKey(this.cellCoord(point.x), this.cellCoord(point.y))
    }

    private getOrCreateCellForPoint(point: Point2D) {
        const x = this.cellCoord(point.x)
        const y = this.cellCoord(point.y)
        const key = this.cellKey(x, y)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = createCell(key, x, y)
            this.cells.set(key, cell)
        }
        return cell
    }

    private getCellForEntity(entity: SpatialEntity) {
        const ref = this.entityCells.get(entity.nid)
        if (ref) {
            return this.cells.get(ref.key) || this.getOrCreateCellForPoint(entity)
        }
        return this.getOrCreateCellForPoint(entity)
    }

    private addToCell(entity: SpatialEntity) {
        const cell = this.getOrCreateCellForPoint(entity)
        const wasEmpty = cell.entities.length === 0
        this.entityCells.set(entity.nid, { key: cell.key, index: cell.entities.length })
        cell.entities.push(entity)
        cell.entityNids.push(entity.nid)
        cell.version++
        return wasEmpty
    }

    private removeFromCell(entity: SpatialEntity) {
        const ref = this.entityCells.get(entity.nid)
        if (!ref) {
            return false
        }

        const cell = this.cells.get(ref.key)
        if (!cell) {
            this.entityCells.delete(entity.nid)
            return false
        }

        const lastIndex = cell.entities.length - 1
        const moved = cell.entities[lastIndex]
        cell.entities[ref.index] = moved
        cell.entityNids[ref.index] = moved.nid
        cell.entities.pop()
        cell.entityNids.pop()
        if (moved && moved.nid !== entity.nid) {
            this.entityCells.set(moved.nid, { key: ref.key, index: ref.index })
        }
        const removedCell = cell.entities.length === 0
        if (removedCell) {
            this.cells.delete(ref.key)
        } else {
            cell.version++
        }
        this.entityCells.delete(entity.nid)
        return removedCell
    }

    private updateSpatialCell(entity: SpatialEntity) {
        const current = this.entityCells.get(entity.nid)
        if (!current) {
            return
        }

        const nextKey = this.cellKeyForPoint(entity)
        if (current.key === nextKey) {
            return
        }

        const fromCell = current.key
        const removedCell = this.removeFromCell(entity)
        const createdCell = this.addToCell(entity)
        this.movedRoots.push({ entity, fromCell, toCell: nextKey })
        this.membershipVersion++
        if (removedCell || createdCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
    }

    private markCellDirtyForEntity(entity: SpatialEntity) {
        let ref = this.entityCells.get(entity.nid)
        if (ref) {
            this.updateSpatialCell(entity)
            ref = this.entityCells.get(entity.nid)
            if (!ref) {
                return null
            }
            this.dirtyCells.add(ref.key)
            return this.cells.get(ref.key)
        }

        const rootNid = this.localState.getRootNid(entity.nid)
        if (rootNid && rootNid !== entity.nid) {
            const rootRef = this.entityCells.get(rootNid)
            if (rootRef) {
                this.dirtyCells.add(rootRef.key)
                return this.cells.get(rootRef.key)
            }
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

    private viewRange(view: AABB2D) {
        const halfWidth = view.halfWidth + this.queryPadding
        const halfHeight = view.halfHeight + this.queryPadding
        const startX = view.x - halfWidth
        const startY = view.y - halfHeight
        const endX = view.x + halfWidth
        const endY = view.y + halfHeight

        return {
            minX: this.cellCoord(startX),
            maxX: this.cellCoordForEnd(endX),
            minY: this.cellCoord(startY),
            maxY: this.cellCoordForEnd(endY)
        }
    }

    private buildVisibleCells(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        const nids: number[] = []
        if (!view) {
            return { keys, nids }
        }

        const range = this.viewRange(view)
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                const key = this.cellKey(cellX, cellY)
                const cell = this.cells.get(key)
                if (!cell) {
                    continue
                }
                keys.push(key)
                for (let i = 0; i < cell.entityNids.length; i++) {
                    nids.push(cell.entityNids[i])
                }
            }
        }

        return { keys, nids }
    }

    private getCellDeleteNids(key: string) {
        const nids: number[] = []
        const cell = this.cells.get(key)
        if (!cell) {
            return nids
        }

        for (let i = 0; i < cell.entityNids.length; i++) {
            this.localState.collectEntityTreeDeletes(cell.entityNids[i], nids)
        }
        return nids
    }

    createEntityWriter(ntype: number, schema: Schema): TrustedSpatialTypeWriters {
        const props: TrustedSpatialTypeWriters['props'] = Object.create(null)
        const groups: TrustedSpatialTypeWriters['groups'] = Object.create(null)
        const writers: TrustedSpatialTypeWriters = {
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
                cell.trustedPropNids.push(entity.nid)
                cell.trustedPropSchemas.push(prop)
                cell.trustedPropValues.push(value)
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
                    cell.trustedGroupNids.push(entity.nid)
                    cell.trustedGroupSchemas.push(group)
                    cell.trustedGroupValueOffsets.push(cell.trustedGroupValues.length)
                    cell.trustedGroupValues.push(v0)
                }
            } else if (group.props.length === 2) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.trustedGroupNids.push(entity.nid)
                    cell.trustedGroupSchemas.push(group)
                    cell.trustedGroupValueOffsets.push(cell.trustedGroupValues.length)
                    cell.trustedGroupValues.push(v0, v1)
                }
            } else if (group.props.length === 3) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any, v2: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.trustedGroupNids.push(entity.nid)
                    cell.trustedGroupSchemas.push(group)
                    cell.trustedGroupValueOffsets.push(cell.trustedGroupValues.length)
                    cell.trustedGroupValues.push(v0, v1, v2)
                }
            } else if (group.props.length === 4) {
                groups[group.name] = (entity: SpatialEntity, v0: any, v1: any, v2: any, v3: any) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.trustedGroupNids.push(entity.nid)
                    cell.trustedGroupSchemas.push(group)
                    cell.trustedGroupValueOffsets.push(cell.trustedGroupValues.length)
                    cell.trustedGroupValues.push(v0, v1, v2, v3)
                }
            } else {
                groups[group.name] = (entity: SpatialEntity, ...values: any[]) => {
                    const cell = this.markCellDirtyForEntity(entity)
                    if (!cell) {
                        return
                    }
                    cell.trustedGroupNids.push(entity.nid)
                    cell.trustedGroupSchemas.push(group)
                    cell.trustedGroupValueOffsets.push(cell.trustedGroupValues.length)
                    for (let j = 0; j < group.props.length; j++) {
                        cell.trustedGroupValues.push(values[j])
                    }
                }
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

    type(ntype: number, schema: Schema): TrustedSpatialTypeWriters {
        return this.createEntityWriter(ntype, schema)
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

    updateEntity(entity: SpatialEntity) {
        this.updateSpatialCell(entity)
    }

    removeEntity(entity: SpatialEntity) {
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
    }

    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity as SpatialEntity))
    }

    addMessage(message: any) {
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
            const cell = this.cells.get(key)
            if (!cell) {
                continue
            }
            cell.trustedPropNids.length = 0
            cell.trustedPropSchemas.length = 0
            cell.trustedPropValues.length = 0
            cell.trustedGroupNids.length = 0
            cell.trustedGroupSchemas.length = 0
            cell.trustedGroupValueOffsets.length = 0
            cell.trustedGroupValues.length = 0
        }
        this.dirtyCells.clear()
        this.movedRoots.length = 0
        this.structuralDeltas = false
    }

    subscribe(user: User, view: AABB2D) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: AABB2D) {
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
        return this.cells.get(key)?.entities || []
    }

    getCellEntityNids(key: string) {
        return this.cells.get(key)?.entityNids || []
    }

    getCellVersion(key: string) {
        return this.cells.get(key)?.version || 0
    }

    getTrustedCellUpdateLog(key: string) {
        return this.cells.get(key) || null
    }

    cellHasTrustedUpdates(key: string) {
        return this.dirtyCells.has(key)
    }

    getMovedRoots() {
        return this.movedRoots
    }

    hasStructuralDeltas() {
        return this.structuralDeltas
    }

    getUserViewVersion(userId: number) {
        return this.viewVersions.get(userId) || 0
    }

    getVisibleCellVersionSignature(userId: number) {
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

    hasStableRememberedCells(userId: number) {
        return this.getStableVisibleCellKeys(userId) !== null
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
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this as any)
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleEntityCache.clear()
        this.rememberedCells.clear()
        this.rememberedCellSignatures.clear()
        this.cells.clear()
        this.entityCells.clear()
        this.visibilityResolver = () => true
    }
}
